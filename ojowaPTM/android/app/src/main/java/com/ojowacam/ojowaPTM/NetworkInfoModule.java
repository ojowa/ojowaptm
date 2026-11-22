package com.ojowacam.ojowaPTM;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.Enumeration;

public class NetworkInfoModule extends ReactContextBaseJavaModule {

    private static final String TAG = "NetworkInfoModule";

    public NetworkInfoModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "NetworkInfo";
    }

    @ReactMethod
    public void getIpAddress(Promise promise) {
        try {
            // First try to get WiFi IP
            WifiManager wifiManager = (WifiManager) getReactApplicationContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null) {
                WifiInfo wifiInfo = wifiManager.getConnectionInfo();
                int ipAddress = wifiInfo.getIpAddress();
                if (ipAddress != 0) {
                    String ip = intToIp(ipAddress);
                    Log.i(TAG, "Got WiFi IP: " + ip);
                    promise.resolve(ip);
                    return;
                }
            }

            // Fallback: iterate through network interfaces
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();
                if (networkInterface.isLoopback() || !networkInterface.isUp()) {
                    continue;
                }
                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (!address.isLoopbackAddress() && address.getHostAddress().indexOf(':') == -1) {
                        String ip = address.getHostAddress();
                        Log.i(TAG, "Got IP from interface: " + ip);
                        promise.resolve(ip);
                        return;
                    }
                }
            }

            promise.resolve("unknown");
        } catch (Exception e) {
            Log.e(TAG, "Failed to get IP address", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    private String intToIp(int ipAddress) {
        return ((ipAddress & 0xFF) + "." +
                ((ipAddress >> 8) & 0xFF) + "." +
                ((ipAddress >> 16) & 0xFF) + "." +
                ((ipAddress >> 24) & 0xFF));
    }
}