#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0600
#endif

#ifdef _WIN32
# define _WIN32_WINNT 0x0600
# include <winsock2.h>
# include <ws2tcpip.h>
# include <iphlpapi.h>
# pragma comment(lib, "ws2_32.lib")
# pragma comment(lib, "iphlpapi.lib")
# define SOCK_ERRNO WSAGetLastError()
# define SOCK_EINTR WSAEINTR
# define SOCK_EWOULDBLOCK WSAEWOULDBLOCK
# define SOCK_EAGAIN WSAEWOULDBLOCK
# define SOCK_CLOSE closesocket
# ifndef ssize_t
#   define ssize_t int64_t
# endif
#else
# include <sys/socket.h>
# include <netinet/in.h>
# include <arpa/inet.h>
# include <unistd.h>
# include <fcntl.h>
# define SOCK_ERRNO errno
# define SOCK_EINTR EINTR
# define SOCK_EWOULDBLOCK EWOULDBLOCK
# define SOCK_EAGAIN EAGAIN
# define SOCK_CLOSE close
#endif

#include "ojowaPTM-audio-source.h"
#include <obs-module.h>
#include <obs.h>
#include <util/platform.h>
#include <util/base.h>
#include <util/dstr.h>
#include <util/threading.h>

#include <atomic>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <vector>
#include <cstring>
#include <cstdint>
#include <string>

// Required libobs module exports (obs_module_set_pointer / obs_module_ver).
OBS_DECLARE_MODULE()

static const uint16_t DEFAULT_OBS_PORT = 8765;
static const uint16_t DEFAULT_DISCOVERY_PORT = 8766;
static const char *OBS_SOURCE_ID = "ojowaptm_audio_source";
static const char *OBS_SOURCE_NAME = "ojowaPTM Microphone";

static const uint8_t STREAM_MAGIC[4] = {0x4F, 0x50, 0x54, 0x4D}; // "OPTM"

struct ojowaptm_audio_data {
    obs_source_t *source;
    std::thread *net_thread;
    std::thread *discovery_thread;
    std::atomic<bool> running{false};

    std::mutex queue_mutex;
    std::condition_variable queue_cv;
    std::vector<std::vector<uint8_t>> pcm_queue;

    uint32_t sample_rate = 48000;
    uint32_t channels = 1;

    std::vector<float> render_buffer;

    // Connection status tracking
    std::atomic<bool> client_connected{false};
    std::string connected_ip;
    uint16_t listen_port = DEFAULT_OBS_PORT;
};

#ifdef _WIN32
static int set_nonblocking(SOCKET fd) {
    u_long nonblocking = 1;
    return ioctlsocket(fd, FIONBIO, &nonblocking);
}
#else
static int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) return -1;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}
#endif

static void *net_thread_proc(void *param) {
    ojowaptm_audio_data *data = static_cast<ojowaptm_audio_data *>(param);

#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        blog(LOG_ERROR, "ojowaPTM: WSAStartup failed");
        return nullptr;
    }
#endif

    // Read port from settings (default DEFAULT_OBS_PORT)
    data->listen_port = data->listen_port ? data->listen_port : DEFAULT_OBS_PORT;
    uint16_t listen_port = data->listen_port;

#ifdef _WIN32
    SOCKET server_fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
#else
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
#endif
#ifdef _WIN32
    if (server_fd == INVALID_SOCKET) {
#else
    if (server_fd < 0) {
#endif
        blog(LOG_ERROR, "ojowaPTM: failed to create socket");
#ifdef _WIN32
        WSACleanup();
#endif
        return nullptr;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));
    set_nonblocking(server_fd);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(listen_port);

    if (bind(server_fd, (sockaddr *)&addr, sizeof(addr)) < 0) {
        blog(LOG_ERROR, "ojowaPTM: bind failed on port %d", listen_port);
        SOCK_CLOSE(server_fd);
#ifdef _WIN32
        WSACleanup();
#endif
        return nullptr;
    }

    if (listen(server_fd, 1) < 0) {
        blog(LOG_ERROR, "ojowaPTM: listen failed");
        SOCK_CLOSE(server_fd);
#ifdef _WIN32
        WSACleanup();
#endif
        return nullptr;
    }

    blog(LOG_INFO, "ojowaPTM: listening on port %d", listen_port);

    fd_set readfds;
    timeval timeout;

    while (data->running.load()) {
        FD_ZERO(&readfds);
        FD_SET(server_fd, &readfds);
        timeout.tv_sec = 0;
        timeout.tv_usec = 200000;

        int activity = select((int)server_fd + 1, &readfds, nullptr, nullptr, &timeout);
        if (activity < 0) {
            if (SOCK_ERRNO == SOCK_EINTR) continue;
            break;
        }
        if (activity == 0) continue;

        if (FD_ISSET(server_fd, &readfds)) {
            SOCKET client_fd = accept(server_fd, nullptr, nullptr);
            if (client_fd < 0 || client_fd == INVALID_SOCKET) continue;

            set_nonblocking(client_fd);
            blog(LOG_INFO, "ojowaPTM: phone connected");

            // Get client IP address
            sockaddr_in client_addr{};
#ifdef _WIN32
            int client_addr_len = sizeof(client_addr);
#else
            socklen_t client_addr_len = sizeof(client_addr);
#endif
            getpeername(client_fd, (sockaddr *)&client_addr, &client_addr_len);
            char client_ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, INET_ADDRSTRLEN);
            
            // Update connection status
            data->client_connected.store(true);
            data->connected_ip = client_ip;
            
            // Update OBS source properties to show connection status
            obs_source_t *source = data->source;
            if (source) {
                obs_data_t *settings = obs_source_get_settings(source);
                obs_data_set_string(settings, "connection_status", "Connected");
                obs_data_set_string(settings, "connected_ip", client_ip);
                obs_source_update(source, settings);
                obs_data_release(settings);
            }
            
            blog(LOG_INFO, "ojowaPTM: phone connected from %s", client_ip);

            uint8_t header[10];

            while (data->running.load()) {
                size_t header_offset = 0;
                while (header_offset < 10 && data->running.load()) {
                    fd_set r;
                    FD_ZERO(&r);
                    FD_SET(client_fd, &r);
                    timeout.tv_sec = 0;
                    timeout.tv_usec = 200000;
                    int sel = select((int)client_fd + 1, &r, nullptr, nullptr, &timeout);
                    if (sel <= 0) continue;

                    ssize_t n = recv(client_fd, reinterpret_cast<char *>(header + header_offset), static_cast<int>(10 - header_offset), 0);
                    if (n <= 0) {
                        if (SOCK_ERRNO == SOCK_EWOULDBLOCK || SOCK_ERRNO == SOCK_EAGAIN) continue;
                        goto disconnect;
                    }
                    header_offset += (size_t)n;
                }
                if (!data->running.load()) goto disconnect;

                if (memcmp(header, STREAM_MAGIC, 4) != 0) {
                    blog(LOG_WARNING, "ojowaPTM: bad magic, disconnecting");
                    goto disconnect;
                }

                uint16_t sample_rate = header[4] | (header[5] << 8);
                uint16_t channels = header[6] | (header[7] << 8);
                uint16_t bit_depth = header[8] | (header[9] << 8);

                data->sample_rate = sample_rate;
                data->channels = channels;

                uint8_t buf[4096];
                while (data->running.load()) {
                    fd_set r;
                    FD_ZERO(&r);
                    FD_SET(client_fd, &r);
                    timeout.tv_sec = 0;
                    timeout.tv_usec = 200000;
                    int sel = select((int)client_fd + 1, &r, nullptr, nullptr, &timeout);
                    if (sel <= 0) continue;

                    ssize_t n = recv(client_fd, reinterpret_cast<char *>(buf), static_cast<int>(sizeof(buf)), 0);
                    if (n <= 0) {
                        if (SOCK_ERRNO == SOCK_EWOULDBLOCK || SOCK_ERRNO == SOCK_EAGAIN) continue;
                        goto disconnect;
                    }

                    std::vector<uint8_t> chunk;
                    chunk.insert(chunk.end(), buf, buf + n);
                    {
                        std::lock_guard<std::mutex> lock(data->queue_mutex);
                        data->pcm_queue.push_back(std::move(chunk));
                    }
                    data->queue_cv.notify_one();
                }
            }

        disconnect:
            SOCK_CLOSE(client_fd);
            blog(LOG_INFO, "ojowaPTM: phone disconnected");
            
            // Update connection status
            data->client_connected.store(false);
            data->connected_ip.clear();
            
            // Update OBS source properties to show disconnected
            obs_source_t *src = data->source;
            if (src) {
                obs_data_t *settings = obs_source_get_settings(src);
                obs_data_set_string(settings, "connection_status", "Disconnected");
                obs_data_set_string(settings, "connected_ip", "");
                obs_source_update(src, settings);
                obs_data_release(settings);
            }
        }
    }

    SOCK_CLOSE(server_fd);
#ifdef _WIN32
    WSACleanup();
#endif
    return nullptr;
}

// Forward declaration
static std::string get_local_ip();

// Discovery thread for auto-discovery by phone app
static void *discovery_thread_proc(void *param) {
    ojowaptm_audio_data *data = static_cast<ojowaptm_audio_data *>(param);

#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        blog(LOG_ERROR, "ojowaPTM: discovery WSAStartup failed");
        return nullptr;
    }
#endif

#ifdef _WIN32
    SOCKET sockfd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
#else
    int sockfd = socket(AF_INET, SOCK_DGRAM, 0);
#endif

#ifdef _WIN32
    if (sockfd == INVALID_SOCKET) {
#else
    if (sockfd < 0) {
#endif
        blog(LOG_ERROR, "ojowaPTM: failed to create discovery socket");
#ifdef _WIN32
        WSACleanup();
#endif
        return nullptr;
    }

    int opt = 1;
    setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));
    setsockopt(sockfd, SOL_SOCKET, SO_BROADCAST, (const char *)&opt, sizeof(opt));
    set_nonblocking(sockfd);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(DEFAULT_DISCOVERY_PORT);

    if (bind(sockfd, (sockaddr *)&addr, sizeof(addr)) < 0) {
        blog(LOG_ERROR, "ojowaPTM: discovery bind failed on port %d", DEFAULT_DISCOVERY_PORT);
        SOCK_CLOSE(sockfd);
#ifdef _WIN32
        WSACleanup();
#endif
        return nullptr;
    }

    blog(LOG_INFO, "ojowaPTM: discovery listening on port %d", DEFAULT_DISCOVERY_PORT);

    const char *DISCOVERY_MAGIC = "OPTM_DISCOVER";
    const char *DISCOVERY_RESPONSE_MAGIC = "OPTM_DISC_RESP";
    std::string local_ip = get_local_ip();

    fd_set readfds;
    timeval timeout;
    uint8_t buf[1024];

    while (data->running.load()) {
        FD_ZERO(&readfds);
        FD_SET(sockfd, &readfds);
        timeout.tv_sec = 0;
        timeout.tv_usec = 200000;

        int activity = select((int)sockfd + 1, &readfds, nullptr, nullptr, &timeout);
        if (activity < 0) {
            if (SOCK_ERRNO == SOCK_EINTR) continue;
            break;
        }
        if (activity == 0) continue;

        if (FD_ISSET(sockfd, &readfds)) {
            sockaddr_in client_addr{};
#ifdef _WIN32
            int client_addr_len = sizeof(sockaddr_in);
#else
            socklen_t client_addr_len = sizeof(sockaddr_in);
#endif
            ssize_t n = recvfrom(sockfd, reinterpret_cast<char *>(buf), sizeof(buf), 0,
                                 (sockaddr *)&client_addr, &client_addr_len);
            if (n <= 0) continue;

            // Check if it's a discovery request
            if (n >= (ssize_t)strlen(DISCOVERY_MAGIC) && 
                memcmp(buf, DISCOVERY_MAGIC, strlen(DISCOVERY_MAGIC)) == 0) {
                
                // Send discovery response with actual listen_port from data
                uint16_t port = data->listen_port ? data->listen_port : DEFAULT_OBS_PORT;
                std::string response = std::string("OPTM_DISC_RESP|") + 
                    std::to_string(port) + "|" + "OBS Studio";
                
                sendto(sockfd, response.c_str(), response.length(), 0,
                       (sockaddr *)&client_addr, sizeof(client_addr));
                blog(LOG_INFO, "ojowaPTM: discovery response sent to client");
            }
        }
    }

    SOCK_CLOSE(sockfd);
#ifdef _WIN32
    WSACleanup();
#endif
    return nullptr;
}

// Check if IP is a private LAN address (not virtual/VPN)
static bool is_lan_ip(const char* ip_str) {
    if (!ip_str) return false;
    int a, b, c, d;
    if (sscanf(ip_str, "%d.%d.%d.%d", &a, &b, &c, &d) != 4) return false;
    // 10.x.x.x
    if (a == 10) return true;
    // 192.168.x.x
    if (a == 192 && b == 168) return true;
    // 172.16.x.x - 172.31.x.x (but exclude common WSL2/Docker ranges)
    if (a == 172 && b >= 16 && b <= 31) {
        // Exclude common WSL2 ranges: 172.16-31.x.x where it's likely virtual
        // But still allow if it's the only option
        return true;
    }
    return false;
}

// Get local IP address of the machine (prefers LAN IPs over virtual/VPN)
static std::string get_local_ip() {
    std::string local_ip = "unknown";
    std::string fallback_ip = "unknown";
    
#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        return local_ip;
    }
    
    // Use GetAdaptersAddresses to enumerate all interfaces
    ULONG flags = GAA_FLAG_INCLUDE_PREFIX;
    ULONG family = AF_INET;
    ULONG buf_size = 15000;
    std::vector<char> buf(buf_size);
    
    IP_ADAPTER_ADDRESSES* adapters = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data());
    DWORD result = GetAdaptersAddresses(family, flags, nullptr, adapters, &buf_size);
    
    if (result == ERROR_BUFFER_OVERFLOW) {
        buf.resize(buf_size);
        adapters = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data());
        result = GetAdaptersAddresses(family, flags, nullptr, adapters, &buf_size);
    }
    
    if (result == NO_ERROR) {
        for (IP_ADAPTER_ADDRESSES* adapter = adapters; adapter != nullptr; adapter = adapter->Next) {
            // Skip loopback, tunnel, and virtual adapters
            if (adapter->IfType == IF_TYPE_SOFTWARE_LOOPBACK) continue;
            if (adapter->OperStatus != IfOperStatusUp) continue;
            
            // Skip common virtual adapter names
            std::wstring desc;
            if (adapter->FriendlyName) {
                desc = std::wstring(adapter->FriendlyName);
            }
            std::string name;
            if (adapter->AdapterName) {
                name = std::string(adapter->AdapterName);
            }
            if (desc.find(L"WSL") != std::wstring::npos) continue;
            if (desc.find(L"Docker") != std::wstring::npos) continue;
            if (desc.find(L"vEthernet") != std::wstring::npos) continue;
            if (desc.find(L"Hyper-V") != std::wstring::npos) continue;
            if (desc.find(L"VPN") != std::wstring::npos) continue;
            if (desc.find(L"Virtual") != std::wstring::npos) continue;
            if (name.find("WSL") != std::string::npos) continue;
            
            for (IP_ADAPTER_UNICAST_ADDRESS* ua = adapter->FirstUnicastAddress; ua != nullptr; ua = ua->Next) {
                if (ua->Address.lpSockaddr->sa_family == AF_INET) {
                    sockaddr_in* sin = reinterpret_cast<sockaddr_in*>(ua->Address.lpSockaddr);
                    char ip_str[INET_ADDRSTRLEN];
                    inet_ntop(AF_INET, &sin->sin_addr, ip_str, INET_ADDRSTRLEN);
                    
                    if (is_lan_ip(ip_str)) {
                        // Prefer non-WSL2 172.x ranges
                        int a, b, c, d;
                        sscanf(ip_str, "%d.%d.%d.%d", &a, &b, &c, &d);
                        if (!(a == 172 && b >= 24 && b <= 31)) { // Avoid 172.24-31.x.x (WSL2)
                            WSACleanup();
                            return std::string(ip_str);
                        }
                        fallback_ip = ip_str;
                    }
                }
            }
        }
    }
    
    // If we found a fallback LAN IP, use it
    if (fallback_ip != "unknown") {
        WSACleanup();
        return fallback_ip;
    }
    
    // Fallback to gethostbyname method
    char hostname[256];
    if (gethostname(hostname, sizeof(hostname)) == 0) {
        struct hostent *host = gethostbyname(hostname);
        if (host && host->h_addr_list[0]) {
            struct in_addr addr;
            memcpy(&addr, host->h_addr_list[0], sizeof(struct in_addr));
            char ip_str[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &addr, ip_str, INET_ADDRSTRLEN);
            local_ip = ip_str;
        }
    }
    WSACleanup();
#else
    int sockfd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sockfd >= 0) {
        sockaddr_in serv{};
        serv.sin_family = AF_INET;
        serv.sin_addr.s_addr = inet_addr("8.8.8.8");
        serv.sin_port = htons(53);
        
        if (connect(sockfd, (struct sockaddr*)&serv, sizeof(serv)) == 0) {
            sockaddr_in name{};
            socklen_t namelen = sizeof(name);
            if (getsockname(sockfd, (struct sockaddr*)&name, &namelen) == 0) {
                char ip_str[INET_ADDRSTRLEN];
                inet_ntop(AF_INET, &name.sin_addr, ip_str, INET_ADDRSTRLEN);
                local_ip = ip_str;
            }
        }
        close(sockfd);
    }
#endif
    
    return local_ip;
}

static void *ojowaptm_audio_create(obs_data_t *settings, obs_source_t *source) {
    UNUSED_PARAMETER(settings);
    auto data = new ojowaptm_audio_data();
    data->source = source;
    data->running.store(true);
    data->net_thread = new std::thread(net_thread_proc, data);
    data->discovery_thread = new std::thread(discovery_thread_proc, data);
    
    // Set the OBS PC IP address in the source settings
    std::string local_ip = get_local_ip();
    obs_data_t *source_settings = obs_source_get_settings(source);
    obs_data_set_string(source_settings, "obs_pc_ip", local_ip.c_str());
    obs_source_update(source, source_settings);
    obs_data_release(source_settings);
    
    return data;
}

static void ojowaptm_audio_destroy(void *data) {
    auto *d = static_cast<ojowaptm_audio_data *>(data);
    d->running.store(false);
    if (d->net_thread) {
        d->net_thread->join();
        delete d->net_thread;
    }
    if (d->discovery_thread) {
        d->discovery_thread->join();
        delete d->discovery_thread;
    }
    delete d;
}

static bool ojowaptm_audio_render(void *data, uint64_t *ts_out,
                                   struct obs_source_audio_mix *audio_output,
                                   uint32_t mixers, size_t channels,
                                   size_t sample_rate) {
    auto *d = static_cast<ojowaptm_audio_data *>(data);

    std::vector<uint8_t> chunk;
    {
        std::unique_lock<std::mutex> lock(d->queue_mutex);
        if (!d->pcm_queue.empty()) {
            chunk = std::move(d->pcm_queue.front());
            d->pcm_queue.erase(d->pcm_queue.begin());
        }
    }

    if (chunk.empty()) return false;

    if (channels == 0) return false;
    size_t frames = chunk.size() / (2 * channels);
    if (frames == 0) return false;

    const int16_t *s16 = reinterpret_cast<const int16_t *>(chunk.data());

    // Reuse persistent render buffer so audio data stays valid
    // after this callback returns (OBS reads from audio_output later).
    d->render_buffer.resize(frames * channels);
    float *samples = d->render_buffer.data();
    for (size_t i = 0; i < frames * channels; i++) {
        samples[i] = s16[i] / 32768.0f;
    }

    audio_output->output[0].data[0] = samples;

    // Output timestamp for audio sync
    if (ts_out) *ts_out = os_gettime_ns();

    return true;
}

static void ojowaptm_audio_update(void *data, obs_data_t *settings) {
    auto *d = static_cast<ojowaptm_audio_data *>(data);
    if (obs_data_has_user_value(settings, "listen_port")) {
        d->listen_port = static_cast<uint16_t>(obs_data_get_int(settings, "listen_port"));
    }
}

static obs_properties_t *ojowaptm_audio_properties(void *data) {
    UNUSED_PARAMETER(data);
    obs_properties_t *props = obs_properties_create();
    
    // OBS PC IP address display (read-only)
    std::string local_ip = get_local_ip();
    obs_properties_add_text(props, "obs_pc_ip", "OBS PC IP Address", OBS_TEXT_INFO);
    
    // Connection status display
    obs_properties_add_text(props, "connection_status", "Connection Status", OBS_TEXT_INFO);
    
    // Connected phone IP display
    obs_properties_add_text(props, "connected_ip", "Connected Phone IP", OBS_TEXT_INFO);
    
    // Port configuration (default 8765)
    obs_properties_add_int(props, "listen_port", "Listen Port", 1024, 65535, 1);
    
    // Device ID (for identification)
    obs_properties_add_text(props, "device_id", "Device ID", OBS_TEXT_DEFAULT);
    
    return props;
}

static const char *ojowaptm_audio_get_name(void *unused) {
    UNUSED_PARAMETER(unused);
    return OBS_SOURCE_NAME;
}

static obs_source_info ojowaptm_audio_source_info{};

static void initialize_source_info() {
    ojowaptm_audio_source_info.id = OBS_SOURCE_ID;
    ojowaptm_audio_source_info.type = OBS_SOURCE_TYPE_INPUT;
    ojowaptm_audio_source_info.output_flags = OBS_SOURCE_AUDIO;
    ojowaptm_audio_source_info.get_name = ojowaptm_audio_get_name;
    ojowaptm_audio_source_info.create = ojowaptm_audio_create;
    ojowaptm_audio_source_info.destroy = ojowaptm_audio_destroy;
    ojowaptm_audio_source_info.audio_render = ojowaptm_audio_render;
    ojowaptm_audio_source_info.get_properties = ojowaptm_audio_properties;
    ojowaptm_audio_source_info.update = ojowaptm_audio_update;
}

bool obs_module_load(void) {
    initialize_source_info();
    obs_register_source(&ojowaptm_audio_source_info);
    blog(LOG_INFO, "ojowaPTM OBS plugin loaded");
    return true;
}

void obs_module_unload(void) {
    blog(LOG_INFO, "ojowaPTM OBS plugin unloaded");
}

const char *obs_module_name(void) {
    return "ojowaPTM Microphone";
}

