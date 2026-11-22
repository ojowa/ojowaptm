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

import { NativeModules, Platform } from 'react-native';
import type { ObsConnection } from '../types';

const { UltraLowLatencyAudio } = NativeModules as {
  UltraLowLatencyAudio?: {
    setAudioSource(source: string): void;
    setServer(host: string, port: number): void;
    startCapture(): void;
    stopCapture(): void;
    isCapturing(): boolean;
    getFramesSent(): number;
  }
};

type StateChange = (state: { connected: boolean; error: string | null }) => void;

export class UltraLowLatencyStreamService {
  private static onStateChange: StateChange | null = null;
  private static isStreaming = false;

  static connect(
    connection: ObsConnection,
    onStateChange: StateChange
  ): Promise<boolean> {
    UltraLowLatencyStreamService.onStateChange = onStateChange;
    console.log('UltraLowLatencyStreamService.connect called', connection);
    
    return new Promise((resolve) => {
      if (!UltraLowLatencyAudio) {
        console.error('UltraLowLatencyAudio native module not available');
        UltraLowLatencyStreamService.onStateChange?.({ connected: false, error: 'Native module not available' });
        resolve(false);
        return;
      }

      isStreaming = false;
      
      try {
        // Configure native module
        UltraLowLatencyAudio.setServer(connection.host, connection.port);
        UltraLowLatencyAudio.setAudioSource('mic'); // Default, can be changed via UI
        
        // Start native capture (bypasses JS entirely)
        UltraLowLatencyAudio.startCapture();
        
        // Give it a moment to connect
        setTimeout(() => {
          if (UltraLowLatencyAudio.isCapturing()) {
            isStreaming = true;
            UltraLowLatencyStreamService.onStateChange?.({ connected: true, error: null });
            console.log('Ultra-low latency streaming started to', connection.host + ':' + connection.port);
            resolve(true);
          } else {
            console.log('Ultra-low latency failed: not capturing');
            UltraLowLatencyStreamService.onStateChange?.({ connected: false, error: 'Failed to start native capture' });
            resolve(false);
          }
        }, 500);
      } catch (err) {
        console.error('Ultra-low latency start error:', err);
        UltraLowLatencyStreamService.onStateChange?.({ connected: false, error: String(err) });
        resolve(false);
      }
    });
  }

  static isConnected(): boolean {
    return isStreaming && (UltraLowLatencyAudio?.isCapturing() ?? false);
  }

  static disconnect(): void {
    if (UltraLowLatencyAudio) {
      try { UltraLowLatencyAudio.stopCapture(); } catch {}
    }
    isStreaming = false;
    UltraLowLatencyStreamService.onStateChange?.({ connected: false, error: null });
  }

  static getFramesSent(): number {
    return UltraLowLatencyAudio?.getFramesSent() ?? 0;
  }
}