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

#ifdef _WIN32
# include <winsock2.h>
# include <ws2tcpip.h>
# pragma comment(lib, "ws2_32.lib")
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
# include <unistd.h>
# include <fcntl.h>
# define SOCK_ERRNO errno
# define SOCK_EINTR EINTR
# define SOCK_EWOULDBLOCK EWOULDBLOCK
# define SOCK_EAGAIN EAGAIN
# define SOCK_CLOSE close
#endif

static const uint16_t OBS_PORT = 8765;
static const char *OBS_SOURCE_ID = "ojowaptm_audio_source";
static const char *OBS_SOURCE_NAME = "ojowaPTM Microphone";

static const uint8_t STREAM_MAGIC[4] = {0x4F, 0x50, 0x54, 0x4D}; // "OPTM"

struct ojowaptm_audio_data {
    obs_source_t *source;
    std::thread *net_thread;
    std::atomic<bool> running{false};

    std::mutex queue_mutex;
    std::condition_variable queue_cv;
    std::vector<std::vector<uint8_t>> pcm_queue;

    uint32_t sample_rate = 48000;
    uint32_t channels = 1;

    std::vector<float> render_buffer;
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
    addr.sin_port = htons(OBS_PORT);

    if (bind(server_fd, (sockaddr *)&addr, sizeof(addr)) < 0) {
        blog(LOG_ERROR, "ojowaPTM: bind failed on port %d", OBS_PORT);
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

    blog(LOG_INFO, "ojowaPTM: listening on port %d", OBS_PORT);

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
        }
    }

    SOCK_CLOSE(server_fd);
#ifdef _WIN32
    WSACleanup();
#endif
    return nullptr;
}

static void *ojowaptm_audio_create(obs_data_t *settings, obs_source_t *source) {
    UNUSED_PARAMETER(settings);
    auto data = new ojowaptm_audio_data();
    data->source = source;
    data->running.store(true);
    data->net_thread = new std::thread(net_thread_proc, data);
    return data;
}

static void ojowaptm_audio_destroy(void *data) {
    auto *d = static_cast<ojowaptm_audio_data *>(data);
    d->running.store(false);
    if (d->net_thread) {
        d->net_thread->join();
        delete d->net_thread;
    }
    delete d;
}

static bool ojowaptm_audio_render(void *data, uint64_t *start_ts,
                                   obs_source_audio_mix *audio_mix,
                                   uint32_t sample_rate, size_t channel_count,
                                   size_t block_size) {
    UNUSED_PARAMETER(start_ts);
    UNUSED_PARAMETER(sample_rate);
    UNUSED_PARAMETER(channel_count);
    UNUSED_PARAMETER(block_size);

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

    if (d->channels == 0) return false;
    size_t frames = chunk.size() / (2 * d->channels);
    if (frames == 0) return false;

    const int16_t *s16 = reinterpret_cast<const int16_t *>(chunk.data());

    // Reuse persistent render buffer so audio data stays valid
    // after this callback returns (OBS reads from audio_mix later).
    d->render_buffer.resize(frames * d->channels);
    float *samples = d->render_buffer.data();
    for (size_t i = 0; i < frames * d->channels; i++) {
        samples[i] = s16[i] / 32768.0f;
    }

    audio_mix->channel_count = d->channels;
    audio_mix->block_size = frames;
    audio_mix->sample_rate = d->sample_rate;
    audio_mix->audio_channels[0] = samples;

    return true;
}

static obs_properties_t *ojowaptm_audio_properties(void *data) {
    UNUSED_PARAMETER(data);
    obs_properties_t *props = obs_properties_create();
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
