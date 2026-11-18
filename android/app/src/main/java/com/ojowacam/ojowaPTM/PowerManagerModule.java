package com.ojowacam.ojowaPTM;

import android.content.Context;
import android.os.PowerManager;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class PowerManagerModule extends ReactContextBaseJavaModule {

    private static final String TAG = "PowerManagerModule";
    private PowerManager.WakeLock wakeLock;

    public PowerManagerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "PowerManager";
    }

    @ReactMethod
    public void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            Log.w(TAG, "Wake lock already held");
            return;
        }

        PowerManager powerManager = (PowerManager) getReactApplicationContext().getSystemService(Context.POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ojowaPTM::WakeLock");
        wakeLock.acquire();
        Log.i(TAG, "Wake lock acquired");
    }

    @ReactMethod
    public void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
            Log.i(TAG, "Wake lock released");
        }
    }
}