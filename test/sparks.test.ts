import { describe, expect, it } from 'vitest';
import { MAX_SPARKS, burst, stepSparks, type Spark } from '../src/sparks.js';

const oneBurst = (over: Partial<Parameters<typeof burst>[0]> = {}) =>
  burst({ x: 100, width: 20, color: '#fff', velocity: 1, seed: 7, ...over });

describe('burst', () => {
  it('throws more pieces for a louder hit', () => {
    expect(oneBurst({ velocity: 1 }).length).toBeGreaterThan(oneBurst({ velocity: 0 }).length);
  });

  it('starts every piece at the hit line, moving upwards', () => {
    for (const spark of oneBurst()) {
      expect(spark.y).toBe(0);
      expect(spark.vy).toBeGreaterThan(0);
      expect(spark.life).toBe(1);
    }
  });

  it('spreads them across the lane, not in a line', () => {
    const xs = oneBurst().map((spark) => spark.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5);
  });

  it('is deterministic — the same hit always looks the same', () => {
    // The one thing in this project that must not be Math.random(): a replayed
    // track, a screenshot test and two viewers all have to see one picture.
    expect(oneBurst({ seed: 42 })).toEqual(oneBurst({ seed: 42 }));
    expect(oneBurst({ seed: 42 })).not.toEqual(oneBurst({ seed: 43 }));
  });
});

describe('stepSparks', () => {
  it('moves them up, slows them, and fades them', () => {
    const start = oneBurst();
    const later = stepSparks(start, 0.1);
    expect(later[0].y).toBeGreaterThan(start[0].y);
    expect(later[0].vy).toBeLessThan(start[0].vy);
    expect(later[0].life).toBeLessThan(1);
  });

  it('empties itself — a pool that never drains is a leak', () => {
    let sparks: Spark[] = oneBurst();
    for (let i = 0; i < 100 && sparks.length > 0; i++) sparks = stepSparks(sparks, 0.05);
    expect(sparks).toHaveLength(0);
  });

  it('is capped however fast the hits come', () => {
    let sparks: Spark[] = [];
    for (let i = 0; i < 200; i++) {
      sparks = stepSparks([...sparks, ...oneBurst({ seed: i })], 0.001);
    }
    expect(sparks.length).toBeLessThanOrEqual(MAX_SPARKS);
  });

  it('leaves the pool alone when no time has passed', () => {
    const sparks = oneBurst();
    expect(stepSparks(sparks, 0)).toBe(sparks);
    expect(stepSparks(sparks, -1)).toBe(sparks);
  });
});
