/**
 * UltraLowLatencyStreamService.ts
 * 
 * Native-only ultra-low latency audio streaming.
 * Bypasses JS bridge entirely for audio data path.
 * 
 * Architecture:
 *   Mic → AudioRecord (5ms) → Native TCP → OBS Plugin
 *   No JS bridge, no Base64, no event loop scheduling
 * 
 * Expected latency: 8-15ms end-to-end
 */

import {
  NativeModules,
  Platform,
  NativeEventEmitter,
  EmitterSubscription,
} from 'react-native';
import type { ObsConnection } from '../types';

const { UltraLowLatencyAudio } = NativeModules as {
  UltraLowLatencyAudio?: {
    setAudioSource(source: string): void;
    setServer(host: string, port: number): void;
    setMuted(muted: boolean): void;
    startCapture(): void;
    stopCapture(): Promise<void>;
    isCapturing(): boolean;
    getFramesSent(): number;
  }
};

export type StreamErrorType = 'network' | 'audio' | 'config' | 'unknown';

type StateChange = (state: {
  connected: boolean;
  error: string | null;
  errorType: StreamErrorType | null;
  nativeError: string | null;
}) => void;

type CaptureError = {
  message: string;
  type: StreamErrorType;
  timestamp: number;
};

export class UltraLowLatencyStreamService {
  private static onStateChange: StateChange | null = null;
  private static isStreaming = false;
  private static errorEmitter: NativeEventEmitter | null = null;
  private static errorSubscription: EmitterSubscription | null = null;
  private static lastCaptureError: CaptureError | null = null;

  /**
   * Classifies a native error message so the UI can show a targeted hint
   * (e.g. "start OBS" vs "grant microphone permission").
   */
  private static classifyError(message: string): CaptureError {
    const msg = (message || '').toLowerCase();
    let type: StreamErrorType = 'unknown';

    // Network / connection errors -> OBS not reachable
    if (
      msg.includes('connectexception') ||
      msg.includes('connection refused') ||
      msg.includes('connection timed out') ||
      msg.includes('sockettimeout') ||
      msg.includes('unknownhost') ||
      msg.includes('noroutetohost') ||
      msg.includes('unreachable') ||
      msg.includes('no route')
    ) {
      type = 'network';
    } else if (
      msg.includes('audiosource') ||
      msg.includes('audiorcord') ||
      msg.includes('audio record') ||
      msg.includes('audiorecord') ||
      msg.includes('permission') ||
      msg.includes('microphone') ||
      msg.includes('record_audio') ||
      msg.includes('state_initialized') ||
      msg.includes('failed to initialize')
    ) {
      type = 'audio';
    } else if (
      msg.includes('server host not set') ||
      msg.includes('host not set')
    ) {
      type = 'config';
    }

    return {
      message,
      type,
      timestamp: Date.now(),
    };
  }

  private static startErrorListening(): void {
    if (!UltraLowLatencyAudio || this.errorSubscription) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.errorEmitter = new NativeEventEmitter(UltraLowLatencyAudio as any);
    this.errorSubscription = this.errorEmitter.addListener(
      'onAudioError',
      (params: { message?: string }) => {
        this.lastCaptureError = this.classifyError(params?.message ?? '');
        console.error('[UltraLowLatency] native error:', this.lastCaptureError);
      }
    );
  }

  private static stopErrorListening(): void {
    this.errorSubscription?.remove();
    this.errorSubscription = null;
    this.errorEmitter = null;
  }

  static connect(
    connection: ObsConnection,
    onStateChange: StateChange
  ): Promise<boolean> {
    UltraLowLatencyStreamService.onStateChange = onStateChange;
    console.log('UltraLowLatencyStreamService.connect called', connection);

    return new Promise((resolve) => {
      if (!UltraLowLatencyAudio) {
        console.error('UltraLowLatencyAudio native module not available');
        UltraLowLatencyStreamService.onStateChange?.({
          connected: false,
          error: 'Native module not available',
          errorType: 'config',
          nativeError: 'UltraLowLatencyAudio native module not available',
        });
        resolve(false);
        return;
      }

      UltraLowLatencyStreamService.isStreaming = false;
      this.lastCaptureError = null;

      // Listen for native error events so we can report WHY capture failed
      this.startErrorListening();

      try {
        // Configure native module
        UltraLowLatencyAudio.setServer(connection.host, connection.port);
        UltraLowLatencyAudio.setAudioSource('mic'); // Default, can be changed via UI

        // Start native capture (bypasses JS entirely)
        UltraLowLatencyAudio.startCapture();

        // Give it time to connect — native TCP connect has 2000ms timeout,
        // so we wait at least 3500ms to allow connection + capture startup
        setTimeout(() => {
          this.stopErrorListening();

          if (UltraLowLatencyAudio.isCapturing()) {
            UltraLowLatencyStreamService.isStreaming = true;
            this.lastCaptureError = null;
            UltraLowLatencyStreamService.onStateChange?.({
              connected: true,
              error: null,
              errorType: null,
              nativeError: null,
            });
            console.log('Ultra-low latency streaming started to', connection.host + ':' + connection.port);
            resolve(true);
          } else {
            const captured = this.lastCaptureError;
            let error: string;
            let errorType: StreamErrorType = captured?.type ?? 'unknown';

            if (captured) {
              // captured.message already includes the native "Failed to start: " prefix
              error = captured.message.startsWith('Failed to start:')
                ? `Failed to start capture: ${captured.message.replace('Failed to start: ', '')}`
                : `Failed to start capture: ${captured.message}`;
            } else {
              // No native error captured but isCapturing() is false
              // This usually means AudioRecord initialization or startRecording failed
              // on the native side without emitting an error event
              error = 'Ultra-low latency failed: native capture did not start. Check Android logcat for AudioRecord errors (e.g., permission denied, unsupported sample rate, or audio device busy).';
              errorType = 'audio';
            }

            // Provide a helpful hint when OBS is not reachable
            if (errorType === 'network' && !captured) {
              error = `Could not reach OBS at ${connection.host}:${connection.port}. Make sure OBS is running with the ojowaPTM plugin listening on port ${connection.port}.`;
              errorType = 'network';
            }

            console.log('Ultra-low latency connect result:', false, '-', error);
            UltraLowLatencyStreamService.onStateChange?.({
              connected: false,
              error,
              errorType,
              nativeError: captured?.message ?? null,
            });
            resolve(false);
          }
        }, 3500);
      } catch (err) {
        const captured = this.classifyError(String(err));
        console.error('Ultra-low latency start error:', err);
        UltraLowLatencyStreamService.onStateChange?.({
          connected: false,
          error: captured.message.startsWith('Failed to start:')
            ? captured.message.replace('Failed to start: ', '')
            : `Failed to start: ${captured.message}`,
          errorType: captured.type,
          nativeError: String(err),
        });
        this.stopErrorListening();
        resolve(false);
      }
    });
  }

  static setMuted(muted: boolean): void {
    if (UltraLowLatencyAudio) {
      try {
        UltraLowLatencyAudio.setMuted(muted);
      } catch (err) {
        console.error('UltraLowLatencyAudio setMuted error:', err);
      }
    }
  }

  static isConnected(): boolean {
    return UltraLowLatencyStreamService.isStreaming && (UltraLowLatencyAudio?.isCapturing() ?? false);
  }

  static async disconnect(): Promise<boolean> {
    if (UltraLowLatencyAudio) {
      try {
        await UltraLowLatencyAudio.stopCapture();
      } catch (err) {
        console.error('UltraLowLatencyAudio stopCapture error:', err);
      }
    }
    UltraLowLatencyStreamService.isStreaming = false;
    this.lastCaptureError = null;
    this.stopErrorListening();
    UltraLowLatencyStreamService.onStateChange?.({
      connected: false,
      error: null,
      errorType: null,
      nativeError: null,
    });
    return true;
  }

  static getFramesSent(): number {
    return UltraLowLatencyAudio?.getFramesSent() ?? 0;
  }

  /** Last captured native error, if any. Useful for debugging. */
  static getLastError(): CaptureError | null {
    return this.lastCaptureError;
  }
}
