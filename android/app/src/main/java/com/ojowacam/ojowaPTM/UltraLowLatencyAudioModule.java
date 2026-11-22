package com.ojowacam.ojowaPTM;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.OutputStream;
import java.net.Socket;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public class UltraLowLatencyAudioModule extends ReactContextBaseJavaModule {

    private static final String TAG = "UltraLowLatencyAudio";
    
    // Ultra-low latency settings
    private static final int SAMPLE_RATE = 48000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int CHUNK_MS = 5;  // 5ms chunks (240 frames @ 48kHz)
    
    // Magic header
    private static final byte[] MAGIC = new byte[] {0x4F, 0x50, 0x54, 0x4D}; // "OPTM"
    private static final int HEADER_SIZE = 18; // 4 magic + 2 sr + 2 ch + 2 bd + 8 timestamp

    private final ReactApplicationContext reactContext;
    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private final AtomicLong framesSent = new AtomicLong(0);
    
    private Thread captureThread;
    private Thread networkThread;
    private AudioRecord audioRecord;
    private Socket socket;
    private OutputStream outputStream;
    private byte[] audioBuffer;
    private byte[] packetBuffer;
    private int selectedAudioSource = MediaRecorder.AudioSource.MIC;
    private String serverHost = "";
    private int serverPort = 8765;

    public UltraLowLatencyAudioModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "UltraLowLatencyAudio";
    }

    @ReactMethod
    public void setAudioSource(String source) {
        switch (source) {
            case "jack":
                selectedAudioSource = MediaRecorder.AudioSource.VOICE_COMMUNICATION;
                break;
            case "default":
                selectedAudioSource = MediaRecorder.AudioSource.DEFAULT;
                break;
            case "voice_communication":
                selectedAudioSource = MediaRecorder.AudioSource.VOICE_COMMUNICATION;
                break;
            case "voice_recognition":
                selectedAudioSource = MediaRecorder.AudioSource.VOICE_CALL;
                break;
            case "camcorder":
                selectedAudioSource = MediaRecorder.AudioSource.CAMCORDER;
                break;
            case "mic":
            default:
                selectedAudioSource = MediaRecorder.AudioSource.MIC;
                break;
        }
        Log.i(TAG, "Audio source set to: " + source);
    }

    @ReactMethod
    public void setServer(String host, int port) {
        this.serverHost = host;
        this.serverPort = port;
        Log.i(TAG, "Server set to " + host + ":" + port);
    }

    @ReactMethod
    public void startCapture() {
        if (isRunning.get()) {
            Log.w(TAG, "Already running");
            return;
        }
        if (serverHost.isEmpty()) {
            sendError("Server host not set");
            return;
        }

        try {
            // Use MINIMUM buffer size for ultra-low latency
            int minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
            Log.i(TAG, "AudioRecord minBufferSize=" + minBufferSize);
            int framesPerChunk = (SAMPLE_RATE * CHUNK_MS) / 1000; // 240 frames @ 5ms
            int chunkBytes = framesPerChunk * 2; // 480 bytes
            
            // Use minimum buffer size directly (no rounding up)
            int bufferSize = Math.max(minBufferSize, chunkBytes);
            bufferSize = (bufferSize / 2) * 2; // Align to 16-bit
            Log.i(TAG, "AudioRecord bufferSize=" + bufferSize);
            
            audioRecord = new AudioRecord(
                selectedAudioSource,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize, state=" + audioRecord.getState());
                sendError("AudioRecord init failed (state=" + audioRecord.getState() + ")");
                return;
            }
            Log.i(TAG, "AudioRecord initialized successfully");

            audioBuffer = new byte[chunkBytes];
            packetBuffer = new byte[HEADER_SIZE + chunkBytes];

            // Connect TCP socket
            socket = new Socket();
            socket.setTcpNoDelay(true); // Critical: disable Nagle
            socket.setSendBufferSize(64 * 1024); // 64KB send buffer
            Log.i(TAG, "Connecting TCP to " + serverHost + ":" + serverPort);
            socket.connect(new InetSocketAddress(serverHost, serverPort), 2000);
            outputStream = socket.getOutputStream();
            
            Log.i(TAG, "TCP connected to " + serverHost + ":" + serverPort);

            isRunning.set(true);
            framesSent.set(0);
            Log.i(TAG, "isRunning set to true, starting threads");

            // Network thread - handles socket writes
            networkThread = new Thread(this::networkLoop, "UltraLowLatency-Network");
            networkThread.setPriority(Thread.MAX_PRIORITY);
            networkThread.start();

            // Capture thread - reads from AudioRecord
            captureThread = new Thread(this::captureLoop, "UltraLowLatency-Capture");
            captureThread.setPriority(Thread.MAX_PRIORITY);
            captureThread.start();

            audioRecord.startRecording();
            Log.i(TAG, "Ultra-low latency capture STARTED: " + CHUNK_MS + "ms chunks, buffer=" + bufferSize);

        } catch (Exception e) {
            Log.e(TAG, "Failed to start: " + e.getClass().getName() + ": " + e.getMessage(), e);
            sendError("Failed to start: " + e.getClass().getName() + ": " + e.getMessage() + " (host=" + serverHost + ", port=" + serverPort + ")");
            cleanup();
        }
    }

    private void captureLoop() {
        while (isRunning.get()) {
            try {
                int read = audioRecord.read(audioBuffer, 0, audioBuffer.length);
                if (read > 0 && isRunning.get()) {
                    // Build packet: header + PCM
                    buildPacket(read);
                    
                    // Non-blocking queue to network thread would be ideal,
                    // but for simplicity write directly (outputStream is buffered)
                    outputStream.write(packetBuffer, 0, HEADER_SIZE + read);
                    outputStream.flush(); // Force immediate send
                    
                    framesSent.addAndGet(read / 2);
                } else if (read < 0) {
                    Log.w(TAG, "AudioRecord read error: " + read);
                }
            } catch (Exception e) {
                if (isRunning.get()) {
                    Log.e(TAG, "Capture loop error", e);
                    sendError("Capture error: " + e.getMessage());
                }
                break;
            }
        }
        Log.i(TAG, "Capture loop ended");
    }

    private void networkLoop() {
        // Keep connection alive, handle reconnection if needed
        while (isRunning.get()) {
            try {
                Thread.sleep(1000);
                if (socket != null && socket.isClosed()) {
                    Log.w(TAG, "Socket closed unexpectedly");
                    break;
                }
            } catch (InterruptedException ignored) {}
        }
    }

    private void buildPacket(int pcmLength) {
        // Magic (4 bytes)
        packetBuffer[0] = MAGIC[0];
        packetBuffer[1] = MAGIC[1];
        packetBuffer[2] = MAGIC[2];
        packetBuffer[3] = MAGIC[3];
        
        // Sample rate (2 bytes, LE)
        packetBuffer[4] = (byte)(SAMPLE_RATE & 0xFF);
        packetBuffer[5] = (byte)((SAMPLE_RATE >> 8) & 0xFF);
        
        // Channels (2 bytes, LE)
        packetBuffer[6] = 1;
        packetBuffer[7] = 0;
        
        // Bit depth (2 bytes, LE)
        packetBuffer[8] = 16;
        packetBuffer[9] = 0;
        
        // Timestamp (8 bytes, LE) - microseconds since epoch
        long nowUs = System.currentTimeMillis() * 1000L;
        for (int i = 0; i < 8; i++) {
            packetBuffer[10 + i] = (byte)((nowUs >> (i * 8)) & 0xFF);
        }
        
        // PCM data already in packetBuffer[18...] from audioRecord.read()
    }

    @ReactMethod
    public void stopCapture() {
        if (!isRunning.get()) return;
        
        isRunning.set(false);
        
        if (audioRecord != null) {
            try { audioRecord.stop(); } catch (Exception ignored) {}
            try { audioRecord.release(); } catch (Exception ignored) {}
            audioRecord = null;
        }
        
        if (outputStream != null) {
            try { outputStream.close(); } catch (Exception ignored) {}
        }
        if (socket != null) {
            try { socket.close(); } catch (Exception ignored) {}
        }
        
        if (captureThread != null) {
            captureThread.interrupt();
        }
        if (networkThread != null) {
            networkThread.interrupt();
        }
        
        Log.i(TAG, "Ultra-low latency capture STOPPED. Frames sent: " + framesSent.get());
    }

    @ReactMethod
    public boolean isCapturing() {
        return isRunning.get();
    }

    @ReactMethod
    public long getFramesSent() {
        return framesSent.get();
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required by NativeEventEmitter on the JS side
    }

    @ReactMethod
    public void removeListeners(double count) {
        // Required by NativeEventEmitter on the JS side
    }

    private void cleanup() {
        isRunning.set(false);
        try {
            if (audioRecord != null) { audioRecord.stop(); audioRecord.release(); }
            if (outputStream != null) { outputStream.close(); }
            if (socket != null) { socket.close(); }
        } catch (Exception ignored) {}
        audioRecord = null;
        outputStream = null;
        socket = null;
    }

    private void sendError(String message) {
        WritableMap params = Arguments.createMap();
        params.putString("message", message);
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onAudioError", params);
    }
}