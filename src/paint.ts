/**
 * The falling area, for any roll.
 *
 * Deliberately lane-agnostic: a note here belongs to a `lane`, and the caller
 * says where a lane sits. `PianoRoll` keys lanes by MIDI number, `DrumRoll` by
 * `$400E` period index, and neither needs a painter of its own — the fall, the
 * blocks, the landing glow and the hit line are the same picture either way.
 */

/** Where a lane sits across the width. */
export interface LaneColumn {
  x: number;
  width: number;
}

import type { Spark } from './sparks.js';

/** A vertical rule down the falling area — an octave edge, a lane boundary. */
export interface Guide {
  x: number;
  /** Draw it stronger, the way a C is louder than an F. */
  strong?: boolean;
}

/**
 * A note's pitch against time: `[position 0..1 through the note, semitones]`.
 *
 * The driver's own output, sampled frame by frame and thinned, so the points are
 * not evenly spaced — the gaps are where the pitch was not moving.
 */
export type PitchCurve = readonly (readonly [number, number])[];

/** One note with its colour already resolved — what the canvas actually draws. */
export interface PaintedNote {
  /** Key into the caller's `columns` map. */
  lane: number;
  /** Seconds from the start of the piece. */
  start: number;
  duration: number;
  /** 0..1 — how loud, which sets the block's weight. */
  velocity: number;
  color: string;
  /** Hatch the block as well as colouring it. */
  hatch: boolean;
  /**
   * Shown, but not heard — a muted voice.
   *
   * Faded rather than dropped, because a muted voice is still part of the
   * piece: with its blocks gone the reader cannot see what they have silenced,
   * and a track muted down to one voice loses the shape of everything it was
   * playing against. Faded, the answer to "what is the bass doing here" is on
   * screen whether or not the bass is audible.
   *
   * It takes no part in what SOUNDS, though: a dimmed note lights no lane,
   * throws no sparks and puts no name on the slip, because none of that is
   * happening. See `frameOf`.
   */
  dimmed?: boolean;
  /**
   * Vibrato, a bend or a slide on this note — drawn as the curve itself.
   *
   * A block sits in the lane of the note's FIRST pitch, so without this a slide
   * of an octave looks exactly like a note that stays put: the picture says one
   * thing and the sound does another. Drawing the real curve means the shape is
   * the label — a wave is vibrato, a line leaning into the next lane is a slide
   * — with nothing to look up.
   */
  bend?: PitchCurve;
}

/** A lane's own column of the falling area, tinted so the lane reads as a lane. */
export interface LaneBackdrop extends LaneColumn {
  color: string;
}

/**
 * A lane that is sounding right now.
 *
 * It carries the note's own `start` because "the same lane is still lit" and
 * "it was hit again" are different facts and look different on screen — a drum
 * struck twice has to move twice. Comparing colours alone cannot tell them
 * apart, since the second hit is usually the same colour as the first.
 */
export interface LitLane {
  color: string;
  /** Start of the note doing the lighting, in seconds. The hit's identity. */
  start: number;
  /** 0..1, for anything that should react harder to a louder hit. */
  velocity: number;
}

export interface PaintInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  /** Height of the falling area. The hit line is its bottom edge. */
  height: number;
  columns: ReadonlyMap<number, LaneColumn>;
  guides?: readonly Guide[];
  /**
   * Faint columns behind the notes. A keyboard needs none — the keys under it
   * already say where a lane is — but a handful of drum pads floating in a wide
   * panel do, or the blocks look like they are falling through empty space.
   */
  backdrops?: readonly LaneBackdrop[];
  /** Only the notes in view; the caller windows them. */
  notes: readonly PaintedNote[];
  time: number;
  lookAhead: number;
  /** lane → the note sounding on it, for the glow at the hit line. */
  lit: ReadonlyMap<number, LitLane>;
  /** What is left of the blocks that have landed. See `sparks.ts`. */
  sparks?: readonly Spark[];
  /**
   * Pixels across for one semitone — the scale a `bend` curve is drawn at.
   *
   * The caller's, because only it knows what a lane means: a semitone on a
   * keyboard is a key, and on a drum kit it is nothing at all. Left out, a
   * curve is drawn against the block's own width instead, which keeps the shape
   * readable where there is no pitch axis to be true to.
   */
  semitonePx?: number;
}

/** Gap on each side of a block, so two neighbouring lanes never read as one bar. */
const INSET = 1.5;
/**
 * Gap above a block, taken off the TOP.
 *
 * A repeated note is written as several notes back to back, so without it the
 * run is one tall bar and the repeats are invisible — and counting them is most
 * of what this view is for. The bottom edge keeps its exact position because
 * that edge is the timing: it is the one the eye reads the landing off.
 *
 * 1.5 was enough to prove there were two blocks and not enough to read them as
 * two: at the rounded corners the seam closed up and a run came out as one bar
 * with scratches in it. 4 is a gap the eye counts without stopping to, and the
 * price is paid by the block's top edge, which carries no timing.
 *
 * It is a CEILING, not the gap itself — see `GAP_SHARE`.
 */
const STACK_GAP = 4;
/**
 * And what the gap is where 4px would be too much: this fraction of the block.
 *
 * A block's height is its duration times `fallHeight / lookAhead`, and that
 * runs from about 540 px a second at the closest zoom to under 60 at a wide
 * one — a thirty-fold range. A fixed gap is therefore two different things at
 * the two ends: on a 54px block 4px is 7% and barely proves the seam is there,
 * while on a 6px block it is most of the note. Fixed, it punishes exactly the
 * view where the blocks are already smallest.
 *
 * As a share it is the same gap to the eye wherever it lands, and the ceiling
 * stops a long held note from being drawn with a chunk missing off the top.
 */
const GAP_SHARE = 0.18;
/** A block shorter than this would vanish; a 1-tick note still has to be visible. */
const MIN_BLOCK = 3;
/**
 * How round a block's ends are, as a fraction of its narrow side.
 *
 * A half is a capsule — the ends are semicircles and there is no straight run
 * of edge left at all. A block is a length of light, not a brick, and the flat
 * corners it used to have were the main thing saying otherwise.
 */
const RADIUS_SHARE = 0.5;

/**
 * The halo, in px around the block, and how strong it is at its widest.
 *
 * Done as two oversized rounded rects behind the block rather than with canvas
 * `shadowBlur`. The shadow is prettier and costs a full-canvas blur per block —
 * with three rolls of twenty visible blocks that is sixty blurs a frame, and it
 * shows. Two extra fills are all but free and at this size the eye cannot tell
 * which one it is looking at.
 */
const GLOW_SPREAD = 3.5;
const GLOW_ALPHA = 0.17;

/**
 * How white the middle of a block goes.
 *
 * A lit thing is brightest where it is thickest, and the colour survives at the
 * edges where the light has least of it to get through — which is what makes a
 * block read as glowing rather than as painted. Laid over the colour as a white
 * gradient so it works for any CSS colour the caller hands us, with no parsing.
 */
const CORE_WHITE = 0.82;

/**
 * A rising spark's coloured bloom, and its white core, as multiples of its own
 * size.
 *
 * The bloom is what makes a handful of pieces read as a burst: drawn additively
 * they overlap into one bright patch where the break was, and thin out into
 * separate points as they scatter. The core is the piece itself, and it is what
 * a spark actually looks like — white where it is hot, its colour only in the
 * light it throws.
 */
const SPARK_BLOOM = 2.4;
const SPARK_CORE = 0.5;

/**
 * What a muted voice's blocks are painted at.
 *
 * A quarter reads as "this one is off" from across the room while the notes are
 * still legible up close — which is the bargain the whole idea rests on. Much
 * lower and the voice may as well be gone; much higher and a glance at four
 * rolls cannot tell which of them are sounding.
 */
const DIMMED = 0.26;
/** The pitch trail, over a dark stroke so it survives a light block colour. */
const TRAIL_WIDTH = 1.5;
const GLOW_HEIGHT = 72;

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
};

/**
 * Diagonal hatch, built once.
 *
 * This is the secondary encoding a palette in the 6–8 CVD band owes: identity
 * must not rest on hue alone. `PianoRoll` uses it when a caller puts four or
 * more voices on one keyboard.
 */
let hatchPattern: CanvasPattern | null | undefined;

function hatch(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (hatchPattern !== undefined) return hatchPattern;

  const tile = document.createElement('canvas');
  tile.width = 6;
  tile.height = 6;
  const tileCtx = tile.getContext('2d');
  let pattern: CanvasPattern | null = null;
  if (tileCtx) {
    tileCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    tileCtx.lineWidth = 1.5;
    tileCtx.beginPath();
    tileCtx.moveTo(-2, 8);
    tileCtx.lineTo(8, -2);
    tileCtx.moveTo(1, 11);
    tileCtx.lineTo(11, 1);
    tileCtx.stroke();
    pattern = ctx.createPattern(tile, 'repeat');
  }
  hatchPattern = pattern;
  return pattern;
}

/**
 * A pitch curve as points on the canvas.
 *
 * `y` is time, exactly as the block's own edges are: the curve starts at the
 * block's bottom edge — the note's beginning, the edge the landing is read off —
 * and runs up its length. `x` is the pitch, offset from the middle of the lane
 * by the curve's own semitones, so a slide leans out of its lane towards the one
 * it is heading for and vibrato wobbles about the middle of its own.
 *
 * Pure, because this is the part that can be wrong: which way is later, which
 * way is up, and what a semitone is worth in pixels.
 */
export function trailPoints(
  curve: PitchCurve,
  centre: number,
  bottom: number,
  full: number,
  unit: number
): [number, number][] {
  return curve.map(([position, semitones]) => [
    centre + semitones * unit,
    bottom - position * full,
  ]);
}

/** How far the pitch travels, in semitones — what sets the trail's weight. */
export const trailPeak = (curve: PitchCurve): number =>
  curve.reduce((peak, [, semitones]) => Math.max(peak, Math.abs(semitones)), 0);

/**
 * The note's pitch curve, drawn along the block it belongs to.
 *
 * `y` is time, exactly as the block's own edges are, so the curve starts at the
 * block's bottom edge and runs up its length; `x` is the pitch, offset from the
 * middle of the lane by the curve's own semitones. A slide therefore leans out
 * of its lane towards the one it is heading for, and vibrato wobbles about the
 * middle of its own.
 *
 * Stroked twice — dark and wide, then light and narrow — because the trail has
 * to read over a block of any colour and over the empty area beside it alike.
 */
function paintTrail(
  ctx: CanvasRenderingContext2D,
  curve: PitchCurve,
  centre: number,
  bottom: number,
  full: number,
  unit: number
) {
  if (curve.length < 2) return;

  // How far the pitch actually travels decides how loud the mark is.
  //
  // Most curves in this ROM are a drift of a fifth of a semitone at the end of a
  // note — 261 of the 304, against 43 real gestures. Drawn at full strength they
  // would put a bright line on a third of the blocks in wookie hole and say
  // nothing, since a fifth of a key of lean has no shape to read. Drawn not at
  // all they would hide an effect that is genuinely there. So the line fades
  // with the gesture: a hairline for a drift, a bold stroke for a slide.
  const strength = Math.min(1, trailPeak(curve));

  ctx.beginPath();
  const points = trailPoints(curve, centre, bottom, full, unit);
  for (let i = 0; i < points.length; i++) {
    if (i === 0) ctx.moveTo(points[i][0], points[i][1]);
    else ctx.lineTo(points[i][0], points[i][1]);
  }

  const width = TRAIL_WIDTH * (0.7 + 0.3 * strength);
  ctx.lineJoin = 'round';
  // Butt, not round: a round cap adds half a line width past each end, and the
  // bottom end sits exactly on the block's leading edge, which is the one the
  // eye times the landing against.
  ctx.lineCap = 'butt';
  ctx.strokeStyle = `rgba(0,0,0,${0.2 + 0.35 * strength})`;
  ctx.lineWidth = width + 1.5;
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.62 * strength})`;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * The whole falling area for one instant.
 *
 * `y` is a straight reading of time: the bottom edge is NOW, the top of the area
 * is `now + lookAhead`, so a block's bottom edge touches its lane at the moment
 * the note sounds. Everything else here follows from that one line.
 */
export function paintRoll({
  ctx,
  width,
  height,
  columns,
  guides = [],
  backdrops = [],
  notes,
  time,
  lookAhead,
  lit,
  sparks,
  semitonePx,
}: PaintInput): void {
  ctx.clearRect(0, 0, width, height);
  if (height <= 0 || width <= 0) return;

  /** Where a block lands — the bottom of the falling area, against the keys. */
  const hitY = height;
  const pxPerSecond = hitY / lookAhead;
  const yAt = (t: number) => hitY - (t - time) * pxPerSecond;

  // Faint, and fading in towards the hit line: a lane has to be findable, but a
  // solid column of colour behind the blocks leaves them nowhere to be.
  ctx.save();
  for (const backdrop of backdrops) {
    const gradient = ctx.createLinearGradient(0, 0, 0, hitY);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, backdrop.color);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = gradient;
    ctx.fillRect(backdrop.x, 0, backdrop.width, hitY);
  }
  ctx.restore();

  for (const guide of guides) {
    ctx.fillStyle = guide.strong ? 'rgba(255,255,255,0.085)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(guide.x, 0, 1, hitY);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, hitY);
  ctx.clip();

  for (const note of notes) {
    const column = columns.get(note.lane);
    if (!column) continue;

    const bottom = yAt(note.start);
    const top = yAt(note.start + note.duration);
    if (top > hitY || bottom < 0) continue;

    const x = column.x + INSET;
    const w = Math.max(1, column.width - INSET * 2);
    const full = bottom - top;
    // Proportional up to the ceiling, and floored at `MIN_BLOCK`, so the seam
    // survives at every zoom without ever eating the note it separates.
    const h = Math.max(MIN_BLOCK, full - Math.min(STACK_GAP, full * GAP_SHARE));
    const y = bottom - h;

    // Far enough down that "muted" is unmistakable at a glance, far enough up
    // that the pitches are still readable — the whole point of keeping them.
    const fade = note.dimmed ? DIMMED : 1;

    const alpha = (0.4 + 0.6 * note.velocity) * fade;
    const radius = Math.min(w, h) * RADIUS_SHARE;

    // The halo first, widest and faintest, so the block is sitting in its own
    // light rather than having light drawn on top of it.
    ctx.fillStyle = note.color;
    for (const [spread, strength] of [
      [GLOW_SPREAD, GLOW_ALPHA * 0.55],
      [GLOW_SPREAD * 0.45, GLOW_ALPHA],
    ] as const) {
      ctx.globalAlpha = alpha * strength;
      roundRect(
        ctx,
        x - spread,
        y - spread,
        w + spread * 2,
        h + spread * 2,
        radius + spread * RADIUS_SHARE
      );
      ctx.fill();
    }

    ctx.globalAlpha = alpha;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();

    // And the light inside it: white through the middle, the voice's colour
    // surviving at the two edges. Across the width rather than down the length,
    // because that is the direction the eye reads a tube of light in.
    ctx.save();
    ctx.clip();
    const core = ctx.createLinearGradient(x, 0, x + w, 0);
    core.addColorStop(0, 'rgba(255,255,255,0)');
    core.addColorStop(0.5, `rgba(255,255,255,${CORE_WHITE})`);
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    if (note.hatch) {
      const pattern = hatch(ctx);
      if (pattern) {
        ctx.save();
        roundRect(ctx, x, y, w, h, radius);
        ctx.clip();
        ctx.globalAlpha = 0.35 * fade;
        ctx.fillStyle = pattern;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }
    }

    // A lighter lip on the leading edge — the edge that meets the lane is the one
    // the eye times the landing against. Inset from the ends, so it lies along
    // the flat of the capsule instead of cutting across its curve.
    const lipInset = radius * 0.5;
    ctx.globalAlpha = Math.min(1, 0.3 + 0.35 * note.velocity) * fade;
    ctx.fillStyle = '#ffffff';
    roundRect(
      ctx,
      x + lipInset,
      Math.max(y, bottom - 1.5),
      Math.max(1, w - lipInset * 2),
      1.5,
      0.75
    );
    ctx.fill();

    if (note.bend) {
      ctx.globalAlpha = fade;
      paintTrail(ctx, note.bend, column.x + column.width / 2, bottom, full, semitonePx ?? w);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // The glow rising off a lane that is sounding, in that note's own colour.
  for (const [lane, note] of lit) {
    const column = columns.get(lane);
    if (!column) continue;
    const gradient = ctx.createLinearGradient(0, hitY, 0, hitY - GLOW_HEIGHT);
    gradient.addColorStop(0, note.color);
    gradient.addColorStop(1, 'transparent');
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = gradient;
    ctx.fillRect(column.x, hitY - GLOW_HEIGHT, column.width, GLOW_HEIGHT);
    ctx.restore();
  }

  if (sparks) paintSparks(ctx, sparks, hitY);

  // The hit line itself, so the moment a block lands is a place and not a guess.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(0, hitY - 1, width, 1);
}

export function visibleNotes<T extends { start: number; duration: number }>(
  sorted: readonly T[],
  time: number,
  lookAhead: number,
  maxDuration: number
): T[] {
  const windowEnd = time + lookAhead;
  let lo = 0;
  let hi = sorted.length;
  const earliest = time - maxDuration;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].start < earliest) lo = mid + 1;
    else hi = mid;
  }
  const out: T[] = [];
  for (let i = lo; i < sorted.length && sorted[i].start <= windowEnd; i++) {
    if (sorted[i].start + sorted[i].duration > time) out.push(sorted[i]);
  }
  return out;
}

/**
 * One frame of a roll: window the notes, work out which lanes are sounding, and
 * hand both back. Shared so the two rolls cannot drift on what "sounding" means.
 */
export function frameOf(
  sorted: readonly PaintedNote[],
  time: number,
  lookAhead: number,
  maxDuration: number
): { notes: PaintedNote[]; lit: Map<number, LitLane> } {
  const notes = visibleNotes(sorted, time, lookAhead, maxDuration);

  // Two voices on one lane: the louder one owns the flash, so a doubled melody
  // does not flicker between two colours from one frame to the next.
  const lit = new Map<number, LitLane>();
  for (const note of notes) {
    if (note.start > time || note.start + note.duration <= time) continue;
    // A muted note is not sounding, so it lights nothing. On a lane shared with
    // an audible voice the audible one still lights it, which is the truth.
    if (note.dimmed) continue;
    const current = lit.get(note.lane);
    if (current && current.velocity >= note.velocity) continue;
    lit.set(note.lane, { color: note.color, start: note.start, velocity: note.velocity });
  }
  return { notes, lit };
}

/**
 * The pieces of the landed blocks, above the hit line.
 *
 * Drawn with `lighter` so overlapping sparks add up into a bright core, the way
 * a shower of embers does — with `source-over` a dense burst reads as a flat
 * patch of colour instead.
 */
function paintSparks(ctx: CanvasRenderingContext2D, sparks: readonly Spark[], hitY: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const spark of sparks) {
    const y = hitY - spark.y;
    if (y < -10) continue;
    // Fade on a curve rather than linearly: the last third of a spark's life is
    // most of what the eye sees as "dying away".
    const alpha = spark.life * spark.life * 0.85;
    const radius = spark.size * (0.4 + spark.life * 0.6);

    // A spark is not a coloured dot: it is WHITE where it is hot and coloured
    // only in the bloom around it. Three circles added together — a wide faint
    // one in the voice's colour, the piece itself, and a small near-white core
    // — which is what makes a scatter of them read as embers thrown off a
    // break rather than as confetti.
    ctx.globalAlpha = alpha * 0.42;
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, y, radius * SPARK_BLOOM, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(spark.x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // The hot core. It goes out by getting SMALLER rather than by dimming,
    // because that is how an ember dies — it does not turn grey.
    ctx.globalAlpha = Math.min(1, alpha * 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(spark.x, y, radius * SPARK_CORE * spark.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
