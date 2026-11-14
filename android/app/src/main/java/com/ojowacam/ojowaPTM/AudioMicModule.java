package com.ojowacam.ojowaPTM;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.concurrent.atomic.AtomicBoolean;

public class AudioMicModule extends ReactContextBaseJavaModule {

    private static final String TAG = "AudioMicModule";
    private static final int SAMPLE_RATE = 48000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int BUFFER_SIZE_MS = 20;

    // Android MediaRecorder.AudioSource constants
    private static final int SOURCE_DEFAULT = 0;
    private static final int SOURCE_MIC = 1;
    private static final int SOURCE_VOICE_CALL = 6;
    private static final int SOURCE_VOICE_COMMUNICATION = 7;
    private static final int SOURCE_CAMCORDER = 5;

    private final ReactApplicationContext reactContext;
    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private Thread captureThread;
    private AudioRecord audioRecord;
    private int bufferSize;
    private byte[] audioBuffer;
    private int selectedAudioSource = SOURCE_MIC;

    public AudioMicModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "AudioMicModule";
    }

    @ReactMethod
    public void setAudioSource(String source) {
        switch (source) {
            case "jack":
                // Headset jack / wired mic: prefer VOICE_COMMUNICATION which routes
                // to the wired headset/mic when present, falling back to main mic.
                selectedAudioSource = SOURCE_VOICE_COMMUNICATION;
                break;
            case "default":
                selectedAudioSource = SOURCE_DEFAULT;
                break;
            case "voice_communication":
                selectedAudioSource = SOURCE_VOICE_COMMUNICATION;
                break;
            case "voice_recognition":
                selectedAudioSource = SOURCE_VOICE_CALL;
                break;
            case "camcorder":
                selectedAudioSource = SOURCE_CAMCORDER;
                break;
            case "mic":
            default:
                selectedAudioSource = SOURCE_MIC;
                break;
        }
        Log.i(TAG, "Audio source set to: " + source + " (android source=" + selectedAudioSource + ")");
    }

    @ReactMethod
    public void startCapture() {
        if (isRunning.get()) {
            Log.w(TAG, "Audio capture already running");
            return;
        }

        try {
            bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
            int framesPerBuffer = (SAMPLE_RATE * BUFFER_SIZE_MS) / 1000;
            int desiredSize = framesPerBuffer * 2;
            if (desiredSize < bufferSize) {
                desiredSize = bufferSize;
            }
            desiredSize = (desiredSize / 2) * 2;

            audioRecord = new AudioRecord(
                    selectedAudioSource,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    desiredSize
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize");
                sendEvent("onAudioError", "AudioRecord initialization failed");
                return;
            }

            audioBuffer = new byte[desiredSize];
            audioRecord.startRecording();
            isRunning.set(true);

            captureThread = new Thread(() -> {
                while (isRunning.get()) {
                    int read = audioRecord.read(audioBuffer, 0, audioBuffer.length);
                    if (read > 0 && isRunning.get()) {
                        sendPcmEvent(audioBuffer, read);
                    }
                }
                try { audioRecord.stop(); } catch (Exception e) { /* ignore */ }
                try { audioRecord.release(); } catch (Exception e) { /* ignore */ }
                audioRecord = null;
                isRunning.set(false);
            }, "AudioMicCaptureThread");
            captureThread.setPriority(Thread.MAX_PRIORITY);
            captureThread.start();

            Log.i(TAG, "Audio capture started, bufferSize=" + desiredSize + ", source=" + selectedAudioSource);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start audio capture", e);
            sendEvent("onAudioError", e.getMessage());
            isRunning.set(false);
        }
    }

    @ReactMethod
    public void stopCapture() {
        if (!isRunning.get()) {
            return;
        }
        isRunning.set(false);
        if (captureThread != null) {
            captureThread.interrupt();
            captureThread = null;
        }
        Log.i(TAG, "Audio capture stopped");
    }

    @ReactMethod
    public boolean isCapturing() {
        return isRunning.get();
    }

    private void sendPcmEvent(byte[] pcmBytes, int length) {
        byte[] trimmed = new byte[length];
        System.arraycopy(pcmBytes, 0, trimmed, 0, length);

        String base64 = android.util.Base64.encodeToString(trimmed, android.util.Base64.NO_WRAP);

        WritableMap params = Arguments.createMap();
        params.putString("pcm", base64);
        params.putInt("length", length);
        params.putInt("sampleRate", SAMPLE_RATE);
        params.putInt("channels", 1);
        params.putString("format", "s16le");

        sendEvent("onAudioData", params);
    }

    private void sendEvent(String eventName, Object data) {
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, data);
    }

    private void sendEvent(String eventName, String message) {
        WritableMap params = Arguments.createMap();
        params.putString("message", message);
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }
}