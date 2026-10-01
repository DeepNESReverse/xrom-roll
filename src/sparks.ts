/**
 * What is left of a block when it lands.
 *
 * A block reaching the keys just vanishes, which is the one moment in the whole
 * view that deserves to be seen — it is when the note actually sounds. So it
 * breaks: a handful of pieces thrown up and outwards from the lane, carrying
 * the block's own colour, fading as they rise.
 *
 *
 * Kept apart from the painter and free of canvas so the physics can be checked
 * without a browser: particles must rise, slow, fade, and be gone — a pool that
 * never empties is a leak that only shows up after ten minutes of playing.
 */

export interface Spark {
  /** Px from the left of the canvas. */
  x: number;
  /** Px from the hit line — positive is up the fall, negative is into the key. */
  y: number;
  /** Px per second. */
  vx: number;
  vy: number;
  /** 1 at birth, 0 when gone. */
  life: number;
  /** Seconds this one lives. */
  span: number;
  size: number;
  color: string;
}

/** How fast a spark is pulled back down, px/s². Gentle: they drift, not fall. */
const GRAVITY = 220;
/** Air resistance per second, as a fraction kept. */
const DRAG = 0.34;
/** Nothing bigger than this, however fast the music. */
export const MAX_SPARKS = 320;

/**
 * A deterministic scatter.
 *
 * Seeded from the lane and the note's start, so the same hit looks the same on
 * every render — a screenshot test, a replayed track, or two viewers watching
 * together all see one picture. `Math.random()` here would be the one thing in
 * this project that cannot be reproduced.
 */
function scatter(seed: number, index: number): number {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export interface BurstOptions {
  /** Centre of the lane, in px. */
  x: number;
  width: number;
  color: string;
  /** 0..1 — a loud hit throws more, and further. */
  velocity: number;
  /** Anything that identifies this hit; the same one always scatters the same. */
  seed: number;
  count?: number;
}

/** The pieces a landing block breaks into. */
export function burst(options: BurstOptions): Spark[] {
  const { x, width, color, velocity, seed } = options;
  const count = options.count ?? Math.round(5 + 7 * velocity);
  const sparks: Spark[] = [];

  for (let i = 0; i < count; i++) {
    const across = scatter(seed, i) - 0.5;
    const up = scatter(seed, i + 100);
    const spin = scatter(seed, i + 200);
    sparks.push({
      x: x + across * width,
      y: 0,
      // Sideways from the middle of the lane, so the spray follows the block's
      // own width rather than firing straight up in a line.
      vx: across * width * 3.2 + (spin - 0.5) * 40,
      vy: 150 + up * 190 + velocity * 130,
      life: 1,
      span: 0.42 + up * 0.36,
      size: 1.4 + spin * 2.1 + velocity * 1.1,
      color,
    });
  }
  return sparks;
}

/**
 * Move every spark on by `dt` seconds and drop the dead ones.
 *
 * Returns a new array rather than mutating, because the caller holds it in a
 * ref across frames and a half-updated pool during a paint is a flicker nobody
 * can reproduce.
 */
export function stepSparks(sparks: readonly Spark[], dt: number): Spark[] {
  if (dt <= 0) return sparks as Spark[];
  const kept = Math.min(1, Math.max(0, 1 - DRAG * dt));
  const next: Spark[] = [];

  for (const spark of sparks) {
    const life = spark.life - dt / spark.span;
    if (life <= 0) continue;
    const vy = (spark.vy - GRAVITY * dt) * kept;
    next.push({
      ...spark,
      life,
      x: spark.x + spark.vx * dt,
      y: spark.y + spark.vy * dt,
      vx: spark.vx * kept,
      vy,
    });
  }
  // Oldest first, so a burst arriving in a full pool pushes out what is nearly
  // gone rather than what just appeared.
  return next.length > MAX_SPARKS ? next.slice(next.length - MAX_SPARKS) : next;
}
