package com.ojowacam.ojowaPTM;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.net.DhcpInfo;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.net.DatagramSocket;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ObsDiscoveryModule extends ReactContextBaseJavaModule {

    private static final String TAG = "ObsDiscovery";
    private static final int DISCOVERY_PORT = 8766;
    private static final String DISCOVERY_MAGIC = "OPTM_DISCOVER";
    private static final String RESPONSE_MAGIC = "OPTM_DISC_RESP";
    private static final int DISCOVERY_TIMEOUT_MS = 4000;

    private DatagramSocket socket;
    private volatile boolean isRunning = false;
    private ExecutorService executor;

    public ObsDiscoveryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        executor = Executors.newSingleThreadExecutor();
    }

    @Override
    public String getName() {
        return "ObsDiscovery";
    }

    @ReactMethod
    public void startDiscovery() {
        // T24: Double-start protection - atomic check-and-set
        if (isRunning) {
            Log.w(TAG, "Discovery already running");
            return;
        }
        isRunning = true;

        executor.execute(() -> {
            try {
                socket = new DatagramSocket();
                socket.setBroadcast(true);
                socket.setSoTimeout(DISCOVERY_TIMEOUT_MS);

                // Determine broadcast address from WiFi
                InetAddress broadcastAddr = getBroadcastAddress();
                if (broadcastAddr == null) {
                    broadcastAddr = InetAddress.getByName("255.255.255.255");
                }

                // Send discovery request
                byte[] request = DISCOVERY_MAGIC.getBytes(StandardCharsets.UTF_8);
                DatagramPacket requestPacket = new DatagramPacket(request, request.length, broadcastAddr, DISCOVERY_PORT);
                socket.send(requestPacket);
                Log.i(TAG, "Discovery request sent to " + broadcastAddr.getHostAddress() + ":" + DISCOVERY_PORT);

                // Listen for responses
                byte[] buffer = new byte[1024];
                while (isRunning) {
                    DatagramPacket responsePacket = new DatagramPacket(buffer, buffer.length);
                    try {
                        socket.receive(responsePacket);
                    } catch (java.net.SocketTimeoutException e) {
                        break; // Timeout - stop listening
                    }

                    String response = new String(responsePacket.getData(), 0, responsePacket.getLength(), StandardCharsets.UTF_8).trim();
                    if (response.startsWith(RESPONSE_MAGIC)) {
                        // Parse: OPTM_DISC_RESP|port|deviceName
                        String[] parts = response.split("\\|");
                        if (parts.length >= 3) {
                            String ip = responsePacket.getAddress().getHostAddress();
                            int port;
                            try {
                                port = Integer.parseInt(parts[1]);
                            } catch (NumberFormatException e) {
                                port = 8765;
                            }
                            String deviceName = parts[2];

                            WritableMap event = Arguments.createMap();
                            event.putString("ip", ip);
                            event.putInt("port", port);
                            event.putString("deviceName", deviceName);

                            getReactApplicationContext()
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                                .emit("onObsDiscovered", event);

                            Log.i(TAG, "OBS discovered: " + ip + ":" + port + " (" + deviceName + ")");
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Discovery error", e);
            } finally {
                isRunning = false;
                try {
                    if (socket != null) {
                        socket.close();
                    }
                } catch (Exception ignored) {}
                socket = null;
            }
        });
    }

    @ReactMethod
    public void stopDiscovery() {
        isRunning = false;
        if (socket != null) {
            try {
                socket.close();
            } catch (Exception ignored) {}
            socket = null;
        }
    }

    private InetAddress getBroadcastAddress() {
        try {
            WifiManager wifi = (WifiManager) getReactApplicationContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                DhcpInfo dhcp = wifi.getDhcpInfo();
                if (dhcp != null) {
                    int broadcast = (dhcp.ipAddress & dhcp.netmask) | ~dhcp.netmask;
                    return InetAddress.getByAddress(new byte[] {
                        (byte) (broadcast & 0xFF),
                        (byte) ((broadcast >> 8) & 0xFF),
                        (byte) ((broadcast >> 16) & 0xFF),
                        (byte) ((broadcast >> 24) & 0xFF)
                    });
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not determine broadcast address", e);
        }
        return null;
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required by NativeEventEmitter on the JS side
    }

    @ReactMethod
    public void removeListeners(double count) {
        // Required by NativeEventEmitter on the JS side
    }
}


