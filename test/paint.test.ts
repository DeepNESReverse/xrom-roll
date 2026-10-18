import { describe, expect, it } from 'vitest';
import { frameOf, paintRoll, trailPeak, trailPoints, type PaintedNote, type PitchCurve } from '../src/paint.js';

/**
 * The pitch trail's geometry.
 *
 * The drawing is a canvas call and cannot be checked by reading it; the three
 * things that can be wrong here are arithmetic. Which way is later (up, because
 * the bottom edge is the note's beginning), which way a rising pitch goes
 * (right), and what a semitone is worth in pixels.
 */
describe('trailPoints', () => {
  /** A note whose block runs from y=200 (its start) up to y=100 (its end). */
  const bottom = 200;
  const full = 100;
  const centre = 50;
  const unit = 8;

  it('runs upward from the block s leading edge', () => {
    const flat: PitchCurve = [
      [0, 0],
      [1, 0],
    ];
    expect(trailPoints(flat, centre, bottom, full, unit)).toEqual([
      [50, 200],
      [50, 100],
    ]);
  });

  it('leans right as the pitch rises', () => {
    const up: PitchCurve = [
      [0, 0],
      [1, 2],
    ];
    const [start, end] = trailPoints(up, centre, bottom, full, unit);
    expect(start).toEqual([50, 200]);
    // Two semitones at eight pixels each, at the end of the note.
    expect(end).toEqual([66, 100]);
  });

  it('leans left as the pitch falls', () => {
    const down: PitchCurve = [
      [0, 0],
      [1, -5.25],
    ];
    expect(trailPoints(down, centre, bottom, full, unit)[1]).toEqual([50 - 42, 100]);
  });

  it('places a point by its position through the note, not by its index', () => {
    // The curve is thinned, so the gaps are uneven — a point three quarters of
    // the way through has to land three quarters of the way up whether it is
    // the second point or the twentieth.
    const uneven: PitchCurve = [
      [0, 0],
      [0.75, 1],
      [1, 1],
    ];
    expect(trailPoints(uneven, centre, bottom, full, unit)[1]).toEqual([58, 125]);
  });
});

describe('trailPeak', () => {
  it('measures the furthest the pitch gets, in either direction', () => {
    expect(
      trailPeak([
        [0, 0],
        [0.5, -5.3],
        [1, 1.2],
      ])
    ).toBe(5.3);
  });

  it('is zero for a curve that never moves', () => {
    expect(trailPeak([[0, 0]])).toBe(0);
  });
});

/**
 * What a lane looks like across two notes written back to back.
 *
 * This is the shape the repeated-note bug lives in, so it is worth pinning:
 * the lane is lit before the boundary and lit after it, by notes of the same
 * colour, and the ONLY thing that changes is `start`. Anything downstream that
 * decides "has this lane changed" by looking at colour, or at lit-ness, sees
 * nothing happen and draws one long note instead of two.
 *
 * `PianoRoll` reads exactly this difference to play the key's lift; if this
 * test ever says the lane goes dark between the two, that lift is redundant.
 */
describe('frameOf, across a repeated note', () => {
  const twice: PaintedNote[] = [
    { lane: 60, start: 0, duration: 1, color: '#fff', velocity: 1, hatch: false },
    { lane: 60, start: 1, duration: 1, color: '#fff', velocity: 1, hatch: false },
  ];

  it('never lets the lane go dark between them', () => {
    for (const time of [0.9, 0.99, 1, 1.01, 1.1]) {
      expect(frameOf(twice, time, 4, 1).lit.has(60)).toBe(true);
    }
  });

  it("changes nothing but the note's start", () => {
    const before = frameOf(twice, 0.99, 4, 1).lit.get(60)!;
    const after = frameOf(twice, 1.01, 4, 1).lit.get(60)!;
    expect(after.color).toBe(before.color);
    expect(after.velocity).toBe(before.velocity);
    expect(after.start).not.toBe(before.start);
  });
});

/**
 * A muted voice is still on screen, and still not sounding.
 *
 * The two halves of that are what this pins: `frameOf` keeps the blocks in the
 * window so they can be drawn faded, and keeps them out of `lit` so nothing
 * flashes, sparks or gets named for a note nobody can hear.
 */
describe('frameOf, with a muted voice', () => {
  const sounding: PaintedNote = {
    lane: 60,
    start: 0,
    duration: 1,
    color: '#fff',
    velocity: 1,
    hatch: false,
  };
  const muted: PaintedNote = { ...sounding, lane: 64, dimmed: true };

  it('still returns the muted blocks to be drawn', () => {
    const { notes } = frameOf([sounding, muted], 0.5, 4, 1);
    expect(notes).toHaveLength(2);
    expect(notes.some((note) => note.dimmed)).toBe(true);
  });

  it('lights only the lane that is sounding', () => {
    const { lit } = frameOf([sounding, muted], 0.5, 4, 1);
    expect(lit.has(60)).toBe(true);
    expect(lit.has(64)).toBe(false);
  });

  it('lets an audible voice light a lane it shares with a muted one', () => {
    const shared: PaintedNote = { ...muted, lane: 60 };
    const { lit } = frameOf([sounding, shared], 0.5, 4, 1);
    expect(lit.get(60)?.color).toBe('#fff');
  });
});

describe('paintRoll, with a region', () => {
  /** A context that writes down what it is asked to draw, in order. */
  function recorder() {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (target, key) => {
        if (key in target) return target[key];
        if (key === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
        return (...args: unknown[]) => calls.push(`${String(key)} ${args.join(' ')}`);
      },
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }

  it('is painted behind the blocks: tint, dashed edge and label first', () => {
    const { ctx, calls } = recorder();
    paintRoll({
      ctx,
      width: 400,
      height: 200,
      columns: new Map([[110, { x: 300, width: 10 }]]),
      regions: [{ x: 290, width: 110, rgb: '245, 158, 11', edge: 'left', label: 'past the piano' }],
      notes: [{ lane: 110, start: 0.5, duration: 0.5, color: '#fff', velocity: 1, hatch: false } as PaintedNote],
      time: 0,
      lookAhead: 2,
      lit: new Map(),
    });
    const tint = calls.indexOf('fillRect 290 0 110 200');
    const label = calls.findIndex((c) => c.startsWith('fillText PAST THE PIANO'));
    const block = calls.findIndex((c, i) => i > label && (c.startsWith('fillRect') || c.startsWith('roundRect') || c.startsWith('fill')));
    expect(tint).toBeGreaterThanOrEqual(0);
    expect(calls).toContain('moveTo 290.5 0');
    expect(label).toBeGreaterThan(tint);
    expect(block).toBeGreaterThan(label);
  });
});
