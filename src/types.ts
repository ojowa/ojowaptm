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

export type StreamErrorType = 'network' | 'audio' | 'config' | 'unknown';

export interface StreamState {
  isConnected: boolean;
  isStreaming: boolean;
  isMuted: boolean;
  level: number;           // 0..1 RMS
  error: string | null;
  errorType: StreamErrorType | null;
  nativeError: string | null;
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
export const DEFAULT_DISCOVERY_PORT = 8766;

// Magic header for the TCP stream so OBS can identify the protocol
// Header format (18 bytes total, little-endian):
//   [4]  magic "OPTM" (0x4F 0x50 0x54 0x4D)
//   [2]  sampleRate (uint16)
//   [2]  channels   (uint16)
//   [2]  bitDepth   (uint16)
//   [8]  timestamp  (uint64, microseconds since epoch)
export const STREAM_MAGIC = new Uint8Array([0x4F, 0x50, 0x54, 0x4D]); // "OPTM"
export const STREAM_HEADER_SIZE = 18; // 4 + 2 + 2 + 2 + 8