/**
 * ojowaPTM — shared types
 */

export type AudioSource = 'mic' | 'jack' | 'default' | 'voice_communication' | 'voice_recognition' | 'camcorder';

export interface AudioConfig {
  sampleRate: number;      // 48000
  channels: number;        // 1 = mono
  format: 's16le';
  bitDepth: 16;
  chunkMs: number;         // 20ms chunks
  audioSource: AudioSource;
}

export interface StreamState {
  isConnected: boolean;
  isStreaming: boolean;
  isMuted: boolean;
  level: number;           // 0..1 RMS
  error: string | null;
  obshost: string | null;
  obsport: number | null;
}

export interface ObsConnection {
  host: string;
  port: number;
}

export interface ObsServerInfo {
  ip: string;
  port: number;
  deviceName?: string;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  sampleRate: 48000,
  channels: 1,
  format: 's16le',
  bitDepth: 16,
  chunkMs: 20,
  audioSource: 'mic',
};

export const AUDIO_SOURCE_OPTIONS: { value: AudioSource; label: string }[] = [
  { value: 'mic', label: 'Built-in Mic' },
  { value: 'jack', label: 'Headset Jack / Wired Mic' },
  { value: 'default', label: 'Default' },
  { value: 'voice_communication', label: 'Voice Call' },
  { value: 'voice_recognition', label: 'Voice Recognition' },
  { value: 'camcorder', label: 'Camcorder' },
];

export const DEFAULT_OBS_PORT = 8765;

// Magic header for the TCP stream so OBS can identify the protocol
export const STREAM_MAGIC = new Uint8Array([0x4F, 0x50, 0x54, 0x4D]); // "OPTM"