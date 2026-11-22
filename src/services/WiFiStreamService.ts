/**
 * WiFiStreamService.ts
 * TCP client that connects to the OBS plugin (ojowaPTM OBS plugin) and streams
 * raw s16le PCM audio over WiFi.
 *
 * Wire format (little-endian):
 *   [4 bytes] magic "OPTM" (0x4F 0x50 0x54 0x4D)
 *   [2 bytes] sampleRate  (uint16 LE, e.g. 48000)
 *   [2 bytes] channels    (uint16 LE, e.g. 1)
 *   [2 bytes] bitDepth    (uint16 LE, e.g. 16)
 *   [N bytes] PCM payload (s16le interleaved)
 *
 * Each TCP send = one header + one PCM chunk (20ms).
 */

import TcpSocket from 'react-native-tcp-socket';
import type { AudioConfig, ObsConnection } from '../types';
import { STREAM_MAGIC, STREAM_HEADER_SIZE } from '../types';

// atob/btoa polyfills for React Native
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (base64: string) => {
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
  };
}
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (binary: string) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    for (let i = 0; i < binary.length; i += 3) {
      const b1 = binary.charCodeAt(i);
      const b2 = binary.charCodeAt(i + 1);
      const b3 = binary.charCodeAt(i + 2);
      const n = ((b1 & 0xff) << 16) | ((b2 & 0xff) << 8) | (b3 & 0xff);
      output += chars.charAt((n >> 18) & 0x3f);
      output += chars.charAt((n >> 12) & 0x3f);
      output += chars.charAt((n >> 6) & 0x3f);
      output += chars.charAt(n & 0x3f);
    }
    return output.replace(/A+$/, (match) => '='.repeat(match.length));
  };
}

type StateChange = (state: { connected: boolean; error: string | null }) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let socket: any = null;
let isConnected = false;
let reconnectTimer: any = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

let pendingPcm: Int16Array[] = [];
let flushTimer: any = null;
const FLUSH_INTERVAL_MS = 20;

export class WiFiStreamService {
  private static onStateChange: StateChange | null = null;

  static connect(
    connection: ObsConnection,
    onStateChange: StateChange
  ): Promise<boolean> {
    WiFiStreamService.onStateChange = onStateChange;
    return new Promise((resolve) => {
      if (socket) {
        socket.destroy();
        socket = null;
      }
      isConnected = false;
      reconnectAttempts = 0;

      socket = TcpSocket.createConnection({
        port: connection.port,
        host: connection.host,
        tls: false,
      });

      socket.setNoDelay(true);

      socket.on('connect', () => {
        isConnected = true;
        reconnectAttempts = 0;
        clearTimeout(reconnectTimer);
        WiFiStreamService.onStateChange?.({ connected: true, error: null });
        console.log('Connected to OBS at', connection.host + ':' + connection.port);
        resolve(true);
      });

      socket.on('data', (data: any) => {
        // Echo/ack from OBS plugin (optional)
        console.log('OBS data:', data);
      });

      socket.on('error', (err: any) => {
        isConnected = false;
        const msg = err?.message || 'Socket error';
        console.error('Socket error:', msg);
        WiFiStreamService.onStateChange?.({ connected: false, error: msg });
        resolve(false);
        WiFiStreamService._scheduleReconnect(connection, onStateChange);
      });

      socket.on('close', (hadError: boolean) => {
        isConnected = false;
        console.log('Socket closed, hadError=', hadError);
        WiFiStreamService.onStateChange?.({ connected: false, error: hadError ? 'Connection lost' : 'Disconnected' });
        if (hadError) {
          WiFiStreamService._scheduleReconnect(connection, onStateChange);
        }
      });
    });
  }

  private static _scheduleReconnect(
    connection: ObsConnection,
    onStateChange: StateChange
  ): void {
    if (reconnectAttempts >= MAX_RECONNECT) {
      console.log('Max reconnect attempts reached');
      return;
    }
    reconnectAttempts++;
    const delay = Math.min(1000 * reconnectAttempts, 10000);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      console.log('Reconnect attempt', reconnectAttempts);
      WiFiStreamService.connect(connection, onStateChange);
    }, delay);
  }

  static sendPcm(config: AudioConfig, pcm: Int16Array): void {
    if (!socket || !isConnected) return;

    const header = buildHeader(config);
    const pcmBytes = int16ToBytes(pcm);
    const payload = new Uint8Array(header.length + pcmBytes.length);
    payload.set(header, 0);
    payload.set(pcmBytes, header.length);

    try {
      // react-native-tcp-socket: write accepts Uint8Array/Buffer for binary data
      // Pass the Uint8Array directly - it will be treated as binary
      socket.write(payload);
    } catch (err) {
      console.error('Failed to send PCM:', err);
    }
  }

  static isConnected(): boolean {
    return isConnected;
  }

  static disconnect(): void {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectAttempts = 0;
    if (socket) {
      try { socket.destroy(); } catch {}
      socket = null;
    }
    isConnected = false;
    WiFiStreamService.onStateChange?.({ connected: false, error: null });
  }
}

function buildHeader(config: AudioConfig): Uint8Array {
  const buf = new Uint8Array(STREAM_HEADER_SIZE); // 4 magic + 2 + 2 + 2 + 8
  buf.set(STREAM_MAGIC, 0);
  const dv = new DataView(buf.buffer, 4, 14);
  dv.setUint16(0, config.sampleRate, true);
  dv.setUint16(2, config.channels, true);
  dv.setUint16(4, config.bitDepth, true);
  // Timestamp at offset 10 (8 bytes = uint64 microseconds since epoch)
  // Use regular numbers instead of BigInt for JSC compatibility
  const nowMs = Date.now();
  const nowUs = nowMs * 1000;
  // Split into high/low 32-bit parts
  const high = Math.floor(nowUs / 4294967296); // 2^32
  const low = nowUs % 4294967296;
  dv.setUint32(6, high, true);
  dv.setUint32(10, low, true);
  return buf;
}

function int16ToBytes(pcm: Int16Array): Uint8Array {
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}