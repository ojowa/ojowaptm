/**
 * AudioCaptureService.ts
 * Captures raw s16le mono PCM at 48kHz from the Android microphone via the
 * native AudioMicModule (AudioRecord). Emits PCM chunks (Int16Array) and RMS
 * levels to JS over the NativeEventEmitter.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { AudioConfig, AudioSource } from '../types';

type PcmCallback = (pcm: Int16Array) => void;
type LevelCallback = (level: number) => void;

const { AudioMicModule } = NativeModules as { AudioMicModule?: any };

let isCapturing = false;
let pcmCallback: PcmCallback | null = null;
let levelCallback: LevelCallback | null = null;
let pcmSubscription: any = null;
let levelSubscription: any = null;
let errorSubscription: any = null;

export class AudioCaptureService {
  static async startCapture(
    config: AudioConfig,
    onPcm: PcmCallback,
    onLevel: LevelCallback
  ): Promise<boolean> {
    if (isCapturing) return true;
    if (!AudioMicModule) {
      console.warn('AudioMicModule native module not available');
      return false;
    }

    const eventEmitter = new NativeEventEmitter(AudioMicModule);

    pcmCallback = onPcm;
    levelCallback = onLevel;

    pcmSubscription = eventEmitter.addListener('onAudioData', (event: any) => {
      if (!pcmCallback && !levelCallback) return;
      const base64 = event.pcm;
      const bytes = base64ToBytes(base64);
      const int16 = new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        bytes.length / 2
      );

      // Compute RMS level (0..1) for the meter
      if (levelCallback) {
        let sum = 0;
        for (let i = 0; i < int16.length; i++) {
          const s = int16[i] / 32768.0;
          sum += s * s;
        }
        const rms = Math.sqrt(sum / int16.length);
        // Map roughly: silence ~0, loud ~0.3 RMS → scale to 0..1
        const level = Math.min(1, rms * 4);
        levelCallback(level);
      }

      if (pcmCallback) {
        pcmCallback(int16.slice());
      }
    });

    levelSubscription = eventEmitter.addListener('onAudioLevel', (event: any) => {
      if (!levelCallback) return;
      levelCallback(event.level ?? 0);
    });

    errorSubscription = eventEmitter.addListener('onAudioError', (event: any) => {
      console.error('Audio capture error:', event.message);
    });

    try {
      // Select the audio source before starting capture
      await AudioMicModule.setAudioSource(config.audioSource);
      await AudioMicModule.startCapture();
      isCapturing = true;
      console.log('Audio capture started, source=', config.audioSource);
      return true;
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      cleanupSubscriptions();
      pcmCallback = null;
      levelCallback = null;
      return false;
    }
  }

  static async stopCapture(): Promise<void> {
    if (!isCapturing) return;
    if (AudioMicModule) {
      try {
        await AudioMicModule.stopCapture();
      } catch {
        // ignore
      }
    }
    cleanupSubscriptions();
    isCapturing = false;
    pcmCallback = null;
    levelCallback = null;
    console.log('Audio capture stopped');
  }

  static async setAudioSource(source: AudioSource): Promise<void> {
    if (AudioMicModule) {
      try {
        await AudioMicModule.setAudioSource(source);
      } catch {
        // ignore
      }
    }
  }

  static isCapturing(): boolean {
    return isCapturing;
  }
}

function cleanupSubscriptions(): void {
  try { pcmSubscription?.remove(); } catch {}
  try { levelSubscription?.remove(); } catch {}
  try { errorSubscription?.remove(); } catch {}
  pcmSubscription = null;
  levelSubscription = null;
  errorSubscription = null;
}

function base64ToBytes(base64: string): Uint8Array {
  // React Native doesn't have atob/btoa - use built-in polyfill
  const binary = globalThis.atob
    ? atob(base64)
    : base64ToBinary(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64ToBinary(base64: string): string {
  // Simple base64 decode for React Native
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < base64.length; i++) {
    const char = base64.charAt(i);
    if (char === '=') break;
    const index = chars.indexOf(char);
    if (index === -1) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}