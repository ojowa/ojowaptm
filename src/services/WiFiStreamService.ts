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

import { Socket } from 'react-native-tcp-socket';
import type { AudioConfig, ObsConnection } from '../types';
import { STREAM_MAGIC } from '../types';

type StateChange = (state: { connected: boolean; error: string | null }) => void;

let socket: Socket | null = null;
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

      socket = Socket.createConnection({
        port: connection.port,
        host: connection.host,
        tls: false,
      });

      socket.setEncoding('utf8');
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
      // react-native-tcp-socket: write expects ArrayBuffer or string
      socket.write(payload.buffer);
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
  const buf = new Uint8Array(10); // 4 magic + 2 + 2 + 2
  buf.set(STREAM_MAGIC, 0);
  const dv = new DataView(buf.buffer, 4, 6);
  dv.setUint16(0, config.sampleRate, true);
  dv.setUint16(2, config.channels, true);
  dv.setUint16(4, config.bitDepth, true);
  return buf;
}

function int16ToBytes(pcm: Int16Array): Uint8Array {
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}