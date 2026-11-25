# ojowaPTM — Fix Implementation Task List

**Repository:** `C:\Users\aojow\Project\ojowaPTM`  
**Scope:** Android React Native app + C++ OBS Studio plugin  
**Version:** 1.0.1  
**Source:** Full audit of UI alignment, connectivity, audio & latency, and runtime error domains

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High     | 8 |
| Medium   | 13 |
| Low      | 3 |

**Total tasks:** 26  
**Completed:** 26 | **Remaining:** 0  
**Phases:** 0 (Critical Blockers) → 1 (High Priority) → 2 (Medium Priority) → 3 (Low Priority)

---

## Phase 0 — Critical Blockers (P0)

*Must ship together; the app cannot work with the current OBS plugin MSI or the ULL mode.*

### T01 ✅ [DONE] — Rebuild OBS plugin MSI to parse 18-byte header
- **Category:** Connectivity
- **Severity:** Critical
- **Files affected:**
  - `obs-plugin/src/ojowaPTM-audio-source.cpp`
  - `obs-plugin/CMakeLists.txt`
  - `.github/workflows/obs-plugin-ci.yml`
- **Depends on:** None
- **Estimated effort:** 4h
- **Definition of done:**
  - MSI installed on PC parses the 18-byte "OPTM" header (magic + sampleRate + channels + bitDepth + 8-byte timestamp).
  - Phone connects to OBS without "bad magic" errors.
  - OBS log shows plausible latency values.
  - `docs/AUDIO_PIPELINE.md` blocker note removed.

### T02 ✅ [DONE] — Fix ultra-low-latency native capture path (startCapture ordering)
- **Category:** Audio / Runtime Error
- **Severity:** Critical
- **Files affected:**
  - `android/app/src/main/java/com/ojowacam/ojowaPTM/UltraLowLatencyAudioModule.java`
- **Depends on:** None
- **Estimated effort:** 6h
- **Definition of done:**
  - `metro.log` no longer shows `Ultra-low latency failed: not capturing`.
  - `isCapturing()` returns `true` after `startCapture()`.
  - Audio flows to OBS in ULL mode (advertised 8–15ms path functional).
  - `audioRecord.startRecording()` is called before or together with capture/network thread startup.

## Phase 1 — High Priority (P1)

*Fixes that prevent hangs, wrong UI data, or silent failures.*

### T03 ✅ [DONE] — Add TCP connection timeout to `WiFiStreamService.connect()`
- **Category:** Connectivity
- **Severity:** High
- **Files affected:**
  - `src/services/WiFiStreamService.ts`
- **Depends on:** None
- **Estimated effort:** 3h
- **Definition of done:**
  - Promise rejects after a configurable timeout (e.g., 5s) if OBS is unreachable.
  - UI clears "CONNECTING…" state on timeout instead of hanging indefinitely.
  - Caller (`HomeScreen.toggleStream`) can show an actionable error.

### T04 ✅ [DONE] — Fix timestamp clock mismatch for latency calculation
- **Category:** Audio / Latency
- **Severity:** High
- **Files affected:**
  - `src/services/WiFiStreamService.ts` (`buildHeader`)
  - `obs-plugin/src/ojowaPTM-audio-source.cpp` (latency calc)
- **Depends on:** T01
- **Estimated effort:** 4h
- **Definition of done:**
  - Both ends use the same clock reference (wall-clock `Date.now()` on both, or monotonic boot-time on both).
  - OBS logs plausible latency values (e.g., 30–100ms), not nonsense negatives.
  - `data->last_latency_ms` reflects real end-to-end delay.

### T05 ✅ [DONE] — Fix StreamingScreen latency display (show real latency, not RMS)
- **Category:** UI
- **Severity:** High
- **Files affected:**
  - `src/screens/StreamingScreen.tsx`
- **Depends on:** T04 (for real latency source)
- **Estimated effort:** 2h
- **Definition of done:**
  - Latency card shows real `last_latency_ms` from the plugin/OBS.
  - No longer reuses `state.level * 100` as "ms".

### T06 ✅ [DONE] — Fix `WiFiStreamService` resolve/reconnect race
- **Category:** Runtime Error
- **Severity:** High
- **Files affected:**
  - `src/services/WiFiStreamService.ts`
- **Depends on:** None
- **Estimated effort:** 3h
- **Definition of done:**
  - `socket.on('error')` does not both `resolve(false)` and schedule reconnect simultaneously.
  - Caller can distinguish fatal vs. transient errors.
  - No socket leaks or duplicate `onStateChange` callbacks on rapid reconnect.

### T07 ✅ [DONE] — Add unit tests (Jest) for core logic
- **Category:** Runtime Error
- **Severity:** High
- **Files affected:**
  - `src/services/__tests__/` (new directory)
  - `package.json` (`test` script enabled in CI)
- **Depends on:** None
- **Estimated effort:** 8h
- **Definition of done:**
  - Tests pass for `buildHeader`, `int16ToBytes`, RMS calculation, reconnect backoff.
  - `npm test` runs on push/PR via CI workflow.
  - Zero existing tests replaced; coverage added for critical paths.

## Phase 2 — Medium Priority (P2)

*UX correctness, middleware robustness, and audio quality.*

### T08 ✅ [DONE] — Fix Last Connected IP row to show actual port
- **Category:** UI
- **Severity:** Medium
- **Files affected:**
  - `src/screens/HomeScreen.tsx:354`
- **Depends on:** None
- **Estimated effort:** 0.5h
- **Definition of done:**
  - Displays `connection.port` instead of hardcoded `DEFAULT_OBS_PORT`.

### T09 ✅ [DONE] — Fix StreamingScreen "Your Phone IP" label
- **Category:** UI
- **Severity:** Medium
- **Files affected:**
  - `src/screens/StreamingScreen.tsx:91`
- **Depends on:** None
- **Estimated effort:** 0.5h
- **Definition of done:**
  - Shows phone's own IP (from `NetworkInfoModule`), not OBS host IP.
  - Label matches the actual value shown.

### T10 ✅ [DONE] — Fix "Last send" timer to track actual PCM sends
- **Category:** UI
- **Severity:** Medium
- **Files affected:**
  - `src/screens/StreamingScreen.tsx:51-61`
- **Depends on:** None
- **Estimated effort:** 1h
- **Definition of done:**
  - Timer updates on each `sendPcm` call.
  - Not driven by a fixed 1-second `setInterval`.

### T11 ✅ [DONE] — Guard Ultra-Low Latency toggle mid-stream
- **Category:** UI
- **Severity:** Medium
- **Files affected:**
  - `src/screens/HomeScreen.tsx`
  - `src/screens/StreamingScreen.tsx`
- **Depends on:** None
- **Estimated effort:** 1h
- **Definition of done:**
  - Switch disabled while streaming in both screens.
  - Tooltip/hint indicates a restart is required to change mode.

### T12 ✅ [DONE] — Apply audio source changes while streaming
- **Category:** UI / Audio
- **Severity:** Medium
- **Files affected:**
  - `src/screens/HomeScreen.tsx`
  - `src/services/AudioCaptureService.ts`
- **Depends on:** None
- **Estimated effort:** 2h
- **Definition of done:**
  - Changing audio source mid-stream calls `AudioCaptureService.setAudioSource()` on the native module.
  - UI reflects the newly applied source.

### T13 ✅ [DONE] — Improve reconnect loop UX (indicate reconnecting state)
- **Category:** Connectivity
- **Severity:** Medium
- **Files affected:**
  - `src/services/WiFiStreamService.ts`
  - `src/screens/HomeScreen.tsx`
- **Depends on:** T06
- **Estimated effort:** 2h
- **Definition of done:**
  - UI shows "Reconnecting…" during backoff.
  - Reconnect stops cleanly when user taps Stop.

### T14 ✅ [DONE] — Verify ObsDiscovery UDP split pattern matches C++ response
- **Category:** Connectivity
- **Severity:** Medium
- **Files affected:**
  - `android/app/src/main/java/com/ojowacam/ojowaPTM/ObsDiscoveryModule.java:83`
- **Depends on:** None
- **Estimated effort:** 1h
- **Definition of done:**
  - Discovery reliably finds OBS on LAN.
  - `onObsDiscovered` fires with valid IP/port.
  - Java split pattern matches the C++ single-pipe response (`OPTM_DISC_RESP|port|OBS Studio`).

### T15 ✅ [DONE] — Return `true` with silence from `ojowaptm_audio_render` when queue empty
- **Category:** Audio / Latency
- **Severity:** Medium
- **Files affected:**
  - `obs-plugin/src/ojowaPTM-audio-source.cpp:639`
- **Depends on:** T01
- **Estimated effort:** 1h
- **Definition of done:**
  - OBS outputs silence instead of dropping audio blocks during brief network jitter.
  - No audible gaps/muting when queue is momentarily empty.

### T16 ✅ [DONE] — Add sample-rate validation / resampling guard in OBS plugin
- **Category:** Audio
- **Severity:** Medium
- **Files affected:**
  - `obs-plugin/src/ojowaPTM-audio-source.cpp:641-643`
- **Depends on:** T01
- **Estimated effort:** 2h
- **Definition of done:**
  - Plugin rejects or resamples mismatched sample rates.
  - No pitch/speed drift or silence from rate mismatch.

### T17 ✅ [DONE] — Make mute work in ultra-low-latency mode
- **Category:** Audio
- **Severity:** Medium
- **Files affected:**
  - `src/screens/HomeScreen.tsx`
  - `src/services/UltraLowLatencyStreamService.ts`
  - `android/app/src/main/java/com/ojowacam/ojowaPTM/UltraLowLatencyAudioModule.java`
- **Depends on:** T02
- **Estimated effort:** 3h
- **Definition of done:**
  - Mute toggles silence output in ULL mode (native thread stops sending or sends silence).
  - `toggleMute` has effect regardless of streaming path (JS or ULL).

### T18 ✅ [DONE] — Calibrate RMS level meter
- **Category:** Audio
- **Severity:** Medium
- **Files affected:**
  - `src/services/AudioCaptureService.ts:59`
- **Depends on:** None
- **Estimated effort:** 1h
- **Definition of done:**
  - Meter responds smoothly 0–100% without immediate clipping at 0.3 RMS.
  - Quiet speech registers above 0%.

### T19 ✅ [DONE] — Surface async native audio errors to UI state
- **Category:** Runtime Error
- **Severity:** Medium
- **Files affected:**
  - `src/services/AudioCaptureService.ts:73-75`
  - `src/screens/HomeScreen.tsx`
- **Depends on:** None
- **Estimated effort:** 2h
- **Definition of done:**
  - `onAudioError` updates `StreamState.error` / `errorType`.
  - User sees audio failures instead of a silent "streaming" state.

### T20 ✅ [DONE] — Fix `UltraLowLatencyAudioModule.stopCapture()` ordering
- **Category:** Runtime Error
- **Severity:** Medium
- **Files affected:**
  - `android/app/src/main/java/com/ojowacam/ojowaPTM/UltraLowLatencyAudioModule.java:248-300`
- **Depends on:** T02
- **Estimated effort:** 2h
- **Definition of done:**
  - `audioRecord.stop()` called before thread join to unblock blocking `read()`.
  - Stop completes within timeout; no resource leaks.

### T21 ✅ [DONE] — Guard C++ `obs_source_update` thread safety
- **Category:** Runtime Error
- **Severity:** Medium
- **Files affected:**
  - `obs-plugin/src/ojowaPTM-audio-source.cpp`
- **Depends on:** T01
- **Estimated effort:** 2h
- **Definition of done:**
  - Settings/latency updates from net_thread do not race with render thread.
  - Dedicated mutex or main-thread posting used for OBS source updates.

## Phase 3 — Low Priority (P3)

*Polish, maintainability, and hardening.*

### T22 ✅ [DONE] — Extract shared styles into common module
- **Category:** UI
- **Severity:** Low
- **Files affected:**
  - `src/screens/HomeScreen.tsx`
  - `src/screens/StreamingScreen.tsx`
  - New: `src/styles/common.ts`
- **Depends on:** None
- **Estimated effort:** 3h
- **Definition of done:**
  - No duplicated `StyleSheet.create` blocks.
  - Both screens import shared design tokens.

### T23 ✅ [DONE] — Add global JS error boundary / crash handler
- **Category:** Runtime Error
- **Severity:** Low
- **Files affected:**
  - `src/App.tsx`
- **Depends on:** None
- **Estimated effort:** 2h
- **Definition of done:**
  - App catches JS errors gracefully instead of red screen.
  - Errors logged to console/crash reporter.

### T24 ✅ [DONE] — Add double-start protection for ObsDiscovery
- **Category:** Connectivity
- **Severity:** Low
- **Files affected:**
  - `android/app/src/main/java/com/ojowacam/ojowaPTM/ObsDiscoveryModule.java:44-49`
- **Depends on:** None
- **Estimated effort:** 0.5h
- **Definition of done:**
  - Concurrent `startDiscovery()` calls are serialized.
  - No socket leaks on rapid double-start.

### T25 ✅ [DONE] — Document cleartext traffic security limitation
- **Category:** Connectivity / Security
- **Severity:** Low
- **Files affected:**
  - `README.md`
  - `AndroidManifest.xml`
- **Depends on:** None
- **Estimated effort:** 0.5h
- **Definition of done:**
  - README notes LAN-only, unencrypted transport.
  - Recommendation to use trusted WiFi added.

### T26 ✅ [DONE] — Clarify PCM queue cap behavior vs docs
- **Category:** Audio / Docs
- **Severity:** Low
- **Files affected:**
  - `docs/AUDIO_PIPELINE.md`
  - `obs-plugin/src/ojowaPTM-audio-source.cpp:311`
- **Depends on:** T01
- **Estimated effort:** 0.5h
- **Definition of done:**
  - Docs updated to match the 200-chunk cap / drop-oldest behavior.

---

## Suggested Execution Order

```
Sprint 1 (Critical):  T01, T02
Sprint 2 (High):      T03, T04, T05, T06, T07
Sprint 3 (Medium):    T08–T21 (group by feature area)
Sprint 4 (Low):       T22–T26
```

### Key Dependencies

| Blocks | Blocked By |
|--------|------------|
| T01    | T04, T15, T16, T21, T26 |
| T02    | T17, T20 |
| T06    | T13 |
| T04    | T05 |

---

## Acceptance Criteria (Release Readiness)

Before any release, all **P0** and **P1** tasks must be complete:

- [ ] T01: OBS plugin MSI parses 18-byte header; phone connects without "bad magic".
- [ ] T02: ULL mode captures audio; `metro.log` shows no "not capturing" errors.
- [ ] T03: TCP connection has a timeout; UI does not hang on unreachable OBS.
- [ ] T04: Latency calculation uses a common clock on both ends.
- [ ] T05: StreamingScreen shows real latency, not RMS repurposed as ms.
- [ ] T06: No resolve/reconnect race in `WiFiStreamService`.
- [ ] T07: Jest unit tests exist and run in CI.

---

*Generated from full audit of `C:\Users\aojow\Project\ojowaPTM`. Audit covered UI alignment, connectivity, audio & latency, and runtime error domains across the React Native app, Android native modules, and C++ OBS plugin.*