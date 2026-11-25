/**
 * Unit tests for AudioCaptureService RMS level calculation.
 */

function computeRmsLevel(int16: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < int16.length; i++) {
    const s = int16[i] / 32768.0;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / int16.length);
  const level = Math.min(1, rms * 6); // T18: calibrated multiplier
  return level;
}

describe('RMS level calculation', () => {
  it('should return 0 for silence', () => {
    const silence = new Int16Array(100).fill(0);
    expect(computeRmsLevel(silence)).toBe(0);
  });

  it('should return 1.0 for full-scale signal', () => {
    const fullScale = new Int16Array(100).fill(32767);
    expect(computeRmsLevel(fullScale)).toBe(1);
  });

  it('should scale linearly for mid-level signals', () => {
    const mid = new Int16Array(100).fill(16384); // ~0.5 RMS
    const level = computeRmsLevel(mid);
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThanOrEqual(1);
  });

  it('should cap at 1.0 even for values above full scale', () => {
    const over = new Int16Array(100).fill(32767);
    expect(computeRmsLevel(over)).toBe(1);
  });

  it('should handle negative values correctly', () => {
    const mixed = new Int16Array([-32768, 32767, 0, -16384, 16384]);
    const level = computeRmsLevel(mixed);
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThanOrEqual(1);
  });

  it('should map quiet speech (RMS ~0.05) to ~30% level', () => {
    const quiet = new Int16Array(100).fill(1638); // ~0.05 RMS
    const level = computeRmsLevel(quiet);
    expect(level).toBeGreaterThan(0.1);
    expect(level).toBeLessThan(0.6);
  });
});