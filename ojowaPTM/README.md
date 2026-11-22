# ojowaPTM — Phone as Mic for OBS

Turn your Android phone into a wireless microphone for OBS over WiFi.

## Architecture

```
Phone (Android, React Native)  ──TCP WiFi──►  PC (OBS + ojowaPTM plugin)
  • AudioRecord (48kHz s16le mono)           • obs_source_audio input
  • 20ms PCM chunks                           • TCP server on port 8765
```

## Mobile App (Android)

Built with React Native (Expo) + a native `AudioMicModule` using Android `AudioRecord` for real-time PCM capture.

### Prerequisites
- Node.js + npm
- Android Studio with Android SDK
- Expo CLI (`npx expo`)

### Install
```bash
cd C:\Users\aojow\Project\ojowaPTM
npm install
```

### Run on Android
```bash
npx expo run:android
```

Or start the dev server:
```bash
npx expo start
```

### Usage
1. Connect your phone and PC to the same WiFi network.
2. Find your phone's IP address shown on the app screen.
3. In the app, enter the **OBS PC IP address** (the PC running OBS) and port `8765`.
4. Tap **START STREAMING**.
5. In OBS, add the **ojowaPTM Microphone** audio source.
6. Your phone's mic audio now appears in OBS.

## OBS Plugin (C++)

The plugin listens on TCP port 8765, receives s16le PCM from the phone, converts to float planar, and outputs via `obs_source_output_audio`.

### Build
Requires OBS Studio headers (obs-module.h, obs.h, etc.).

```bash
cd C:\Users\aojow\Project\ojowaPTM\obs-plugin
mkdir build && cd build
cmake ..
cmake --build .
```

Copy the resulting `ojowaPTM-obs.dll` (Windows) or `.so` (Linux) to your OBS `obs-plugins` folder, then restart OBS and add "ojowaPTM Microphone" as an audio source.

### Protocol
Each TCP message:
```
Offset  Size  Field
0       4     Magic "OPTM" (0x4F 0x50 0x54 0x4D)
4       2     Sample rate (uint16 LE, e.g. 48000)
6       2     Channels (uint16 LE, e.g. 1)
8       2     Bit depth (uint16 LE, e.g. 16)
10      N     PCM payload (s16le interleaved)
```

## Files
- `src/App.tsx` — Navigation root
- `src/screens/HomeScreen.tsx` — Main UI: connect, stream, mute, level meter
- `src/services/AudioCaptureService.ts` — Bridge to native AudioRecord
- `src/services/WiFiStreamService.ts` — TCP client to OBS
- `src/types.ts` — Shared types & constants
- `android/app/src/main/java/com/ojowacam/ojowaPTM/AudioMicModule.java` — Native AudioRecord capture
- `obs-plugin/src/ojowaPTM-audio-source.cpp` — OBS TCP audio source plugin
