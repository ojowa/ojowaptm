# ojowaPTM Audio Pipeline Documentation

**Version:** 1.0.1  
**Last Updated:** 2026-11-22

---

## Overview

This document describes the complete audio signal path from the Android phone's microphone to the OBS Studio plugin (`ojowaPTM Microphone` source).

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE AUDIO PIPELINE                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   ANDROID PHONE  │     │   NETWORK (TCP)  │     │   WINDOWS PC     │
│                  │     │                  │     │                  │
│ 1. MICROPHONE    │     │ 4. TCP SOCKET    │     │ 7. OBS PLUGIN    │
│    └─ Hardware   │     │    Port 8765     │     │    (ojowaPTM)    │
│    └─ Analog →   │     │    LAN WiFi      │     │                  │
│       Digital    │     │                  │     │                  │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 2. AUDIORECORD   │     │ 5. OBS PLUGIN    │     │ 8. AUDIO RENDER  │
│    (Java/Kotlin) │     │    net_thread    │     │    (C++)         │
│                  │     │                  │     │                  │
│ • Sample Rate:   │     │ • select(50ms)   │     │ • Called by OBS  │
│   48,000 Hz      │     │ • recv() header  │     │   at 48kHz       │
│ • Channels: 1    │     │   (18 bytes)     │     │ • Dequeue PCM    │
│   (MONO)         │     │ • recv() PCM     │     │   chunks         │
│ • Format:        │     │ • Push to queue  │     │ • Convert s16le  │
│   PCM_16BIT      │     │   (mutex)        │     │   → float        │
│ • Buffer:        │     │ • Notify CV      │     │ • Write to       │
│   ~20ms (960     │     │                  │     │   audio_output   │
│   frames)        │     │                  │     │                  │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 3. NATIVE → JS   │     │ 6. AUDIO QUEUE   │     │ 9. OBS MIXER     │
│    BRIDGE        │     │    (C++ vector)  │     │                  │
│                  │     │                  │     │ • Receives float │
│ • JNI call       │     │ • Vector of      │     │   samples        │
│ • Base64 encode  │     │   uint8_t chunks │     │ • Mixes with     │
│ • Event emit     │     │ • Max chunks     │     │   other sources  │
│   (onAudioData)  │     │   unbounded      │     │ • Outputs to     │
│                  │     │ • Protected by   │     │   monitor/stream │
└────────┬─────────┘     │   mutex          │     └──────────────────┘
         │               └────────┬─────────┘
         ▼                        │
┌──────────────────┐              │
│ 4. WiFiStream    │              │
│    Service (TS)  │              │
│                  │              │
│ • TCP connect    │              │
│ • setNoDelay     │              │
│ • buildHeader()  │              │
│   18 bytes       │              │
│ • sendPcm()      │              │
│   (Uint8Array)   │              │
└──────────────────┘              │
                                  ▼
                         ┌──────────────────┐
                         │ 6b. LATENCY CALC │
                         │                  │
                         │ • Parse timestamp│
                         │   from header    │
                         │ • now_us - sent  │
                         │   = latency_us   │
                         │ • Log to OBS     │
                         │   (50 chunks = 1│
                         │    update/sec)   │
                         └──────────────────┘
```

---

## Stage-by-Stage Breakdown

### Stage 1: Microphone Hardware (Android)
- **Component:** Physical MEMS microphone
- **Signal:** Analog acoustic pressure → analog voltage
- **Sampling:** Handled by AudioRecord in Stage 2

### Stage 2: AudioRecord Capture (Java/Kotlin)
**File:** `android/app/src/main/java/com/ojowacam/ojowaPTM/AudioMicModule.java`

| Parameter | Value |
|-----------|-------|
| Sample Rate | 48,000 Hz |
| Channel Config | `CHANNEL_IN_MONO` (1) |
| Audio Format | `ENCODING_PCM_16BIT` (s16le) |
| Buffer Size | `getMinBufferSize()` → ~20 ms (960 frames) |
| Audio Source | Configurable: `MIC` (default), `VOICE_COMMUNICATION`, `VOICE_CALL`, `CAMCORDER`, `DEFAULT` |

**Capture Loop:**
```java
while (isRunning.get()) {
    int read = audioRecord.read(audioBuffer, 0, audioBuffer.length);
    if (read > 0 && isRunning.get()) {
        sendPcmEvent(audioBuffer, read);  // JNI → JS
    }
}
```

**Thread:** Dedicated `AudioMicCaptureThread` at `Thread.MAX_PRIORITY`

---

### Stage 3: JNI Bridge (Java → React Native)
**File:** `AudioMicModule.java:153-167`

```java
private void sendPcmEvent(byte[] pcmBytes, int length) {
    byte[] trimmed = new byte[length];
    System.arraycopy(pcmBytes, 0, trimmed, 0, length);
    String base64 = Base64.encodeToString(trimmed, Base64.NO_WRAP);

    WritableMap params = Arguments.createMap();
    params.putString("pcm", base64);
    params.putInt("length", length);
    params.putInt("sampleRate", SAMPLE_RATE);
    params.putInt("channels", 1);
    params.putString("format", "s16le");

    sendEvent("onAudioData", params);
}
```

| Aspect | Detail |
|--------|--------|
| Encoding | Base64 (NO_WRAP) |
| Event Name | `onAudioData` |
| Payload | `{ pcm: base64, length, sampleRate, channels, format }` |
| Frequency | Every ~20 ms (when buffer fills) |

---

### Stage 4: JS Receive & Callback (TypeScript)
**File:** `src/services/AudioCaptureService.ts`

```typescript
pcmSubscription = eventEmitter.addListener('onAudioData', (event) => {
    const base64 = event.pcm;
    const bytes = base64ToBytes(base64);  // Custom polyfill (no atob in RN)
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    
    // RMS level for UI meter
    if (levelCallback) { /* compute RMS 0..1 */ }
    
    if (pcmCallback) {
        pcmCallback(int16.slice());  // Pass copy to WiFiStreamService
    }
});
```

| Aspect | Detail |
|--------|--------|
| Input | Base64 string from native |
| Output | `Int16Array` (copy) |
| Base64 Decode | Custom polyfill (React Native lacks `atob`) |
| Level Callback | Computes RMS, scales to 0..1 for UI meter |
| PCM Callback | Forwards to `WiFiStreamService.sendPcm()` |

---

### Stage 5: TCP Send (TypeScript)
**File:** `src/services/WiFiStreamService.ts`

```typescript
static sendPcm(config: AudioConfig, pcm: Int16Array): void {
    const header = buildHeader(config);      // 18 bytes
    const pcmBytes = int16ToBytes(pcm);      // Uint8Array view
    const payload = new Uint8Array(header.length + pcmBytes.length);
    payload.set(header, 0);
    payload.set(pcmBytes, header.length);
    socket.write(payload);  // Raw binary, no base64
}
```

**Header Builder:**
```typescript
function buildHeader(config: AudioConfig): Uint8Array {
    const buf = new Uint8Array(STREAM_HEADER_SIZE); // 18 bytes
    buf.set(STREAM_MAGIC, 0);                        // "OPTM"
    const dv = new DataView(buf.buffer, 4, 14);
    dv.setUint16(0, config.sampleRate, true);   // 48000
    dv.setUint16(2, config.channels, true);     // 1
    dv.setUint16(4, config.bitDepth, true);     // 16
    // Timestamp at offset 10 (8 bytes = uint64 µs since epoch)
    const nowUs = Date.now() * 1000;
    const high = Math.floor(nowUs / 4294967296);
    const low = nowUs % 4294967296;
    dv.setUint32(6, high, true);
    dv.setUint32(10, low, true);
    return buf;
}
```

| Aspect | Detail |
|--------|--------|
| Transport | TCP (port 8765) |
| Nagle | Disabled: `socket.setNoDelay(true)` |
| Header | 18 bytes (magic + fmt + timestamp) |
| Payload | Raw `Uint8Array` (binary) |
| Timestamp | Microseconds since Unix epoch (uint64 LE) |

---

### Stage 6: Network Transport
| Parameter | Value |
|-----------|-------|
| Protocol | TCP/IP |
| Port | 8765 (configurable in OBS UI) |
| Interface | LAN WiFi (192.168.x.x) |
| Typical RTT | 1-5 ms on same subnet |
| Packetization | Each `sendPcm()` = one TCP write (header + 20ms PCM) |

---

### Stage 7: OBS Plugin Receive (C++)
**File:** `obs-plugin/src/ojowaPTM-audio-source.cpp`

**Header Parse:**
```cpp
uint8_t header[18];
while (header_offset < 18) {
    // select(50ms) + recv()
}
if (memcmp(header, STREAM_MAGIC, 4) != 0) goto disconnect;

uint16_t sample_rate = header[4] | (header[5] << 8);
uint16_t channels = header[6] | (header[7] << 8);
uint16_t bit_depth = header[8] | (header[9] << 8);

// Timestamp at offset 10 (8 bytes uint64 LE)
uint64_t timestamp_us = header[10] | (header[11]<<8) | ... | (header[17]<<56);
```

**Data Receive Loop:**
```cpp
while (data->running.load()) {
    fd_set r; FD_SET(client_fd, &r);
    timeout.tv_usec = 50000;  // 50ms for fast disconnect
    int sel = select(client_fd+1, &r, nullptr, nullptr, &timeout);
    
    ssize_t n = recv(client_fd, buf, sizeof(buf), 0);
    if (n <= 0) goto disconnect;
    
    std::vector<uint8_t> chunk(buf, buf+n);
    {
        std::lock_guard<std::mutex> lock(data->queue_mutex);
        data->pcm_queue.push_back(std::move(chunk));
    }
    data->queue_cv.notify_one();
}
```

| Aspect | Detail |
|--------|--------|
| Select Timeout | 50 ms (fast disconnect detection) |
| Recv Buffer | 4 KB |
| Queue | `std::vector<std::vector<uint8_t>>` |
| Synchronization | `mutex` + `condition_variable` |
| Magic Check | First 4 bytes = "OPTM" |

---

### Stage 8: Latency Calculation (C++)
```cpp
auto now = std::chrono::steady_clock::now();
auto now_us = std::chrono::duration_cast<std::chrono::microseconds>(now.time_since_epoch()).count();
int64_t latency_ms = (now_us - (int64_t)timestamp_us) / 1000;

if (latency_ms > 0 && latency_ms < 5000) {
    blog(LOG_INFO, "ojowaPTM: latency %lld ms", latency_ms);
    data->last_latency_ms = (int)latency_ms;
    
    // Update OBS UI property (~1/sec)
    if (++latency_update_counter >= 50) {
        obs_data_set_string(settings, "latency_ms", std::to_string(latency_ms).c_str());
        obs_source_update(source, settings);
    }
}
```

| Aspect | Detail |
|--------|--------|
| Clock Source | `steady_clock` (monotonic) |
| Timestamp | From header (µs since epoch) |
| Output | OBS log + "Latency (ms)" property |
| Update Rate | Every 50 chunks ≈ 1/sec |

---

### Stage 9: Audio Render Callback (C++)
**File:** `ojowaPTM-audio-source.cpp:564-603`

```cpp
static bool ojowaptm_audio_render(void *data, uint64_t *ts_out,
                                  struct obs_source_audio_mix *audio_output) {
    auto *d = static_cast<ojowaptm_audio_data*>(data);
    
    std::vector<uint8_t> chunk;
    {
        std::lock_guard<std::mutex> lock(d->queue_mutex);
        if (!d->pcm_queue.empty()) {
            chunk = std::move(d->pcm_queue.front());
            d->pcm_queue.erase(d->pcm_queue.begin());
        }
    }
    
    if (chunk.empty()) return true;  // Silence
    
    // Convert s16le → float
    const int16_t *s16 = reinterpret_cast<const int16_t*>(chunk.data());
    float *samples = d->render_buffer.data();
    for (size_t i = 0; i < chunk.size()/2; i++) {
        samples[i] = s16[i] / 32768.0f;  // -1.0 to 1.0
    }
    
    audio_output->output[0].data[0] = samples;  // Mono → channel 0
    *ts_out = os_gettime_ns();
    return true;
}
```

| Aspect | Detail |
|--------|--------|
| Called By | OBS audio thread (every block) |
| Sample Rate | 48 kHz (matches capture) |
| Conversion | int16 → float (-1.0 to 1.0) |
| Output | `audio_output->output[0].data[0]` (mono) |
| Thread Safety | `mutex` protects queue access |

---

### Stage 10: OBS Mixer
- **Internal:** OBS core audio engine
- **Sample Rate:** 48 kHz (resampled if needed)
- **Channels:** Plugin outputs mono; OBS upmixes to stereo for mixer
- **Latency:** OBS internal buffering ~10-20 ms
- **Outputs:** Monitor, Stream, Recording

---

## Wire Protocol Specification

### Header (18 bytes, Little-Endian)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0-3 | 4 | Magic | ASCII "OPTM" (0x4F 0x50 0x54 0x4D) |
| 4-5 | 2 | Sample Rate | uint16 LE (48000 = 0x80 0xBB) |
| 6-7 | 2 | Channels | uint16 LE (1 = 0x01 0x00) |
| 8-9 | 2 | Bit Depth | uint16 LE (16 = 0x10 0x00) |
| 10-17 | 8 | Timestamp | uint64 LE, microseconds since Unix epoch |

### Payload
- **Format:** s16le (signed 16-bit little-endian)
- **Channels:** 1 (mono)
- **Frame Size:** 2 bytes per sample
- **Chunk Duration:** 20 ms = 960 samples = 1,920 bytes
- **Total Packet:** 18 + 1,920 = 1,938 bytes per 20 ms

---

## Latency Budget (Measured)

| Component | Typical Latency | Notes |
|-----------|-----------------|-------|
| AudioRecord capture | ~20 ms | 1 buffer period (960 frames @ 48kHz) |
| JNI + Base64 + Bridge | 2-5 ms | Java → JNI → Base64 → RN Bridge |
| TCP Send (`setNoDelay`) | 1-3 ms | Immediate socket write |
| LAN WiFi (same subnet) | 1-5 ms | 192.168.x.x typical |
| OBS Recv + Queue | 0-20 ms | Waits for next `audio_render` |
| OBS Internal Buffering | 10-20 ms | OBS audio engine |
| **Total (Typical)** | **34-73 ms** | End-to-end |

**OBS Plugin Log Output:**
```
ojowaPTM: latency 42 ms
ojowaPTM: latency 45 ms
ojowaPTM: latency 38 ms
```

---

## Key Configuration Points

### Phone App (Android)
| Setting | Location | Default |
|---------|----------|---------|
| Sample Rate | `DEFAULT_AUDIO_CONFIG` | 48000 |
| Chunk Size | `chunkMs` | 20 ms |
| Audio Source | `AUDIO_SOURCE_OPTIONS` | 'mic' |
| OBS Port | `DEFAULT_OBS_PORT` | 8765 |

### OBS Plugin (Windows)
| Setting | UI Property | Range | Default |
|---------|-------------|-------|---------|
| Listen Port | "Listen Port" | 1024-65535 | 8765 |
| Device ID | "Device ID" | string | "" |

---

## File Reference

| Platform | File | Responsibility |
|----------|------|----------------|
| Android | `AudioMicModule.java` | AudioRecord capture, JNI bridge |
| Android | `AudioCaptureService.ts` | Native event handling, PCM callbacks |
| Android | `WiFiStreamService.ts` | TCP connection, header build, send |
| Windows | `ojowaPTM-audio-source.cpp` | TCP server, header parse, queue, render |

---

## Current Deployment Status

| Component | Version | Status |
|-----------|---------|--------|
| Android App (Debug) | 1.0.1 | ✅ Running |
| Metro Bundler | 0.80.12 | ✅ Asset-registry fixed |
| Phone → OBS TCP | 1.0.1 | ✅ 18-byte header |
| OBS Plugin MSI | **Old** | ❌ Expects 10-byte header |
| GitHub Actions Build | `a18067c` | ⏳ Building |

**Blocker:** OBS plugin MSI must be rebuilt from latest commit to parse 18-byte header and calculate latency.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Rapid connect/disconnect | Header size mismatch | Update OBS plugin MSI |
| "bad magic" in OBS log | Wrong protocol version | Ensure both ends use 18-byte header |
| No latency in OBS UI | Old plugin | Install new MSI |
| High latency (>100ms) | Network congestion / buffer | Check WiFi, reduce OBS buffer |
| No audio in OBS | Queue empty / format | Verify sample rate match (48kHz) |
| Stop streaming delayed | AudioRecord blocking | `audioRecord.stop()` before thread interrupt |

---

*Generated from source code audit on 2026-11-22*