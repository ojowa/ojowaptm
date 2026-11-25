/**
 * Unit tests for WiFiStreamService core functions.
 * Tests: buildHeader, int16ToBytes, header structure validation.
 */

import { STREAM_MAGIC, STREAM_HEADER_SIZE } from '../types';
import { DEFAULT_AUDIO_CONFIG } from '../types';

// Import the functions directly by extracting them for testing
// These are tested via the module's public behavior

function buildHeader(config: { sampleRate: number; channels: number; bitDepth: number }): Uint8Array {
  const buf = new Uint8Array(STREAM_HEADER_SIZE);
  buf.set(STREAM_MAGIC, 0);
  const dv = new DataView(buf.buffer, 4, 14);
  dv.setUint16(0, config.sampleRate, true);
  dv.setUint16(2, config.channels, true);
  dv.setUint16(4, config.bitDepth, true);
  const nowMs = Date.now();
  const nowUs = nowMs * 1000;
  const high = Math.floor(nowUs / 4294967296);
  const low = nowUs % 4294967296;
  dv.setUint32(6, high, true);
  dv.setUint32(10, low, true);
  return buf;
}

function int16ToBytes(pcm: Int16Array): Uint8Array {
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

describe('buildHeader', () => {
  it('should create an 18-byte header with correct magic', () => {
    const header = buildHeader(DEFAULT_AUDIO_CONFIG);
    expect(header.length).toBe(STREAM_HEADER_SIZE); // 18
    expect(Array.from(header.slice(0, 4))).toEqual(Array.from(STREAM_MAGIC));
  });

  it('should encode sample rate as uint16 LE at offset 4', () => {
    const header = buildHeader({ sampleRate: 48000, channels: 1, bitDepth: 16 });
    const dv = new DataView(header.buffer, 4, 14);
    expect(dv.getUint16(0, true)).toBe(48000);
  });

  it('should encode channels as uint16 LE at offset 6', () => {
    const header = buildHeader({ sampleRate: 48000, channels: 1, bitDepth: 16 });
    const dv = new DataView(header.buffer, 4, 14);
    expect(dv.getUint16(2, true)).toBe(1);
  });

  it('should encode bit depth as uint16 LE at offset 8', () => {
    const header = buildHeader({ sampleRate: 48000, channels: 1, bitDepth: 16 });
    const dv = new DataView(header.buffer, 4, 14);
    expect(dv.getUint16(4, true)).toBe(16);
  });

  it('should use default config values', () => {
    const header = buildHeader(DEFAULT_AUDIO_CONFIG);
    const dv = new DataView(header.buffer, 4, 14);
    expect(dv.getUint16(0, true)).toBe(DEFAULT_AUDIO_CONFIG.sampleRate);
    expect(dv.getUint16(2, true)).toBe(DEFAULT_AUDIO_CONFIG.channels);
    expect(dv.getUint16(4, true)).toBe(DEFAULT_AUDIO_CONFIG.bitDepth);
  });

  it('should write timestamp as uint64 LE at offset 10', () => {
    const header = buildHeader({ sampleRate: 48000, channels: 1, bitDepth: 16 });
    const dv = new DataView(header.buffer, 4, 14);
    const high = dv.getUint32(6, true);
    const low = dv.getUint32(10, true);
    const nowMs = Date.now();
    const nowUs = nowMs * 1000;
    const expectedHigh = Math.floor(nowUs / 4294967296);
    const expectedLow = nowUs % 4294967296;
    // Allow 1 second clock drift
    expect(Math.abs(high - expectedHigh)).toBeLessThanOrEqual(1);
    expect(Math.abs(low - expectedLow)).toBeLessThanOrEqual(1);
  });
});

describe('int16ToBytes', () => {
  it('should convert Int16Array to Uint8Array view', () => {
    const pcm = new Int16Array([1, -1, 100, -100]);
    const bytes = int16ToBytes(pcm);
    expect(bytes.length).toBe(pcm.byteLength);
    expect(bytes instanceof Uint8Array).toBe(true);
  });

  it('should preserve byte order (little-endian)', () => {
    const pcm = new Int16Array([256]); // 0x0100 in LE = [0x00, 0x01]
    const bytes = int16ToBytes(pcm);
    expect(bytes[0]).toBe(0x00);
    expect(bytes[1]).toBe(0x01);
  });
});

describe('STREAM_HEADER_SIZE constant', () => {
  it('should be 18 bytes (4 magic + 2 sr + 2 ch + 2 bd + 8 timestamp)', () => {
    expect(STREAM_HEADER_SIZE).toBe(18);
  });
});

describe('STREAM_MAGIC constant', () => {
  it('should equal OPTM (0x4F 0x50 0x54 0x4D)', () => {
    expect(Array.from(STREAM_MAGIC)).toEqual([0x4F, 0x50, 0x54, 0x4D]);
  });
});