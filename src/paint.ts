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
  /**
   * A drum's own mark in place of the block — see `DrumHead`. Its foot still lands on the hit line
   * at the moment of the hit; a hit longer than the mark trails a thin tail up its length.
   */
  head?: DrumHead;
}

/**
 * What a drum hit is drawn as. A block is a pitched note's shape — a length you hold — and on the
 * kit it made every piece the same pill in the same few greens, which a reader called monotonous
 * (2026-10-18): four hi-hat lanes read as one colour falling four times. A hit is a STRIKE, so each
 * piece falls as the thing struck, the same picture its icon under the lane draws: a cymbal edge-on
 * (an open hat as two with air between them), a drumhead from above for the kick, the toms and the
 * snare (the snare rimmed), a burst for a clap, a stick for a side stick.
 */
export type DrumHead = 'cymbal' | 'openCymbal' | 'kick' | 'tom' | 'snare' | 'clap' | 'stick';

/** A lane's own column of the falling area, tinted so the lane reads as a lane. */
export interface LaneBackdrop extends LaneColumn {
  color: string;
}

/**
 * A stretch of lanes that means something as a whole — the keys past a piano's ends — painted
 * behind the blocks: a tint deepening towards the hit line, a dashed line on its `edge`, and its
 * `label` at the foot, across the stretch if it fits and up it if not.
 */
export interface LaneRegion extends LaneColumn {
  /** `r, g, b` — the tint, the line and the label take their own alphas. */
  rgb: string;
  edge: 'left' | 'right';
  label?: string;
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
  /** Behind the blocks too, over the guides — see `LaneRegion`. */
  regions?: readonly LaneRegion[];
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
  unit: number,
  peak = trailPeak(curve)
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
  const strength = Math.min(1, peak);

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
 * How far a note's pitch has to travel, in semitones, to be drawn as a ribbon instead of a block.
 *
 * Under it the bend is a drift — a fifth of a semitone at a note's end, 261 of Battletoads' 304
 * curves — and the block with its hairline says it. Over it the note GOES somewhere, and other
 * cartridges go a long way: a triangle bass swept down two octaves in a few frames is how half the
 * NES makes a kick. Drawn as a block in its first lane with a white line leaving it, that was a
 * thin pink stub and a wire across half the keyboard, the two reading as unrelated (2026-10-18).
 */
const RIBBON_FROM = 1;
/**
 * The curve's pitch at `position` (0..1 through the note), held from one point to the next as the
 * driver writes it — the pitch actually sounding at that moment.
 */
export function bendAt(curve: PitchCurve, position: number): number {
  let value = curve[0]?.[1] ?? 0;
  for (const [at, semitones] of curve) {
    if (at > position) break;
    value = semitones;
  }
  return value;
}

/**
 * Every whole semitone a curve has covered by `position` (0..1 through the note), from its lowest
 * to its highest point so far — the keys the sound has swept across.
 */
export function passedOver(curve: PitchCurve, position: number): number[] {
  let low = Math.round(curve[0]?.[1] ?? 0);
  let high = low;
  for (const [at, semitones] of curve) {
    if (at > position) break;
    low = Math.min(low, Math.round(semitones));
    high = Math.max(high, Math.round(semitones));
  }
  return Array.from({ length: high - low + 1 }, (_, i) => low + i);
}

/**
 * How often a vibrato's string swings, Hz — about a real vibrato's own rate, so it reads as the
 * note shaking rather than as a flicker or a sway.
 */
const STRING_HZ = 6;

/**
 * Whether a curve is a VIBRATO: one that turns back on itself at least three times, counted with
 * the score's hysteresis (a turn needs a swing back of a quarter semitone), so the flicker a curve
 * opens with and a slide's overshoot are not taken for one. The same reading as `turnsOf` in the
 * score's effects.
 */
export function isVibrato(curve: PitchCurve): boolean {
  if (curve.length === 0) return false;
  // Going nowhere yet: the first swing of a quarter semitone either way from the start sets the
  // direction. Then the curve's farthest point that way is kept, and a swing back of a quarter
  // from it is a turn. The anchor must not follow the curve before a direction is set — a vibrato
  // that eases in by 0.23 a frame (Alien 3's title, pulse 1 at 0:21) never moved a quarter from
  // wherever it had just been, and was taken for a straight note.
  const start = curve[0][1];
  let direction = 0;
  let extreme = start;
  let turns = 0;
  for (const [, semitones] of curve) {
    if (direction === 0) {
      if (Math.abs(semitones - start) >= VIBRATO_SWING) {
        direction = Math.sign(semitones - start);
        extreme = semitones;
      }
    } else if ((semitones - extreme) * direction > 0) {
      extreme = semitones;
    } else if (Math.abs(semitones - extreme) >= VIBRATO_SWING) {
      turns++;
      direction = -direction;
      extreme = semitones;
    }
  }
  return turns >= 3;
}
const VIBRATO_SWING = 0.25;

/**
 * A vibrato's curve as the string is at `phase` seconds into the note: a standing wave — the
 * curve's own shape, its displacement swinging through straight and over to the mirror and back.
 * Only the picture moves; the curve is what the driver played.
 */
export function stringAt(curve: PitchCurve, phase: number): PitchCurve {
  const swing = Math.cos(2 * Math.PI * STRING_HZ * phase);
  return curve.map(([at, semitones]) => [at, semitones * swing] as const);
}

/**
 * A note whose pitch travels, drawn as the note itself travelling: a ribbon the width of its
 * block, in its colour, laid along its pitch curve — it starts in the lane it was struck in and
 * slides where the sound goes, so a sweep is one falling shape. Lit the way a block is: a halo,
 * the colour, a white core, a bright lip at the landing edge.
 */
function paintRibbon(
  ctx: CanvasRenderingContext2D,
  note: PaintedNote,
  curve: PitchCurve,
  centre: number,
  bottom: number,
  full: number,
  unit: number,
  width: number,
  alpha: number,
  fade: number
) {
  // The curve as the driver wrote it, held to the note's both ends — at its real size: a sweep of
  // 29 semitones crosses 29 keys, because that is how far the sound goes.
  const shape: [number, number][] = curve.map(([at, semitones]) => [at, semitones]);
  if (shape.length === 0) return;
  if (shape[0][0] > 0) shape.unshift([0, shape[0][1]]);
  if (shape[shape.length - 1][0] < 1) shape.push([1, shape[shape.length - 1][1]]);
  const points = trailPoints(shape, centre, bottom, full, unit);

  /*
   * The block, swept along the curve: at every moment the note covers its lane's width centred on
   * the pitch it has then, so the shape is that band traced up through time — a hold is a block, a
   * slow slide a leaning block of the same width, and a leap of 27 semitones in two frames (RoboCop
   * 3's triangle) a sliver as thin as the two frames it took. Stroking the curve at full width drew
   * that leap as a bar across the keyboard heavier than the note itself; stroking it thin lost the
   * holds. The width across is constant, the height of each part is its time — the roll's one rule.
   */
  const half = width / 2;
  const outline = () => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x - half, y) : ctx.lineTo(x - half, y)));
    for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(points[i][0] + half, points[i][1]);
    ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  {
    // The halo: the outline itself, wide and faint, so the band sits in its own light as a block does.
    for (const [spread, strength] of [
      [GLOW_SPREAD, GLOW_ALPHA * 0.55],
      [GLOW_SPREAD * 0.45, GLOW_ALPHA],
    ] as const) {
      ctx.globalAlpha = Math.min(1, alpha * strength);
      ctx.strokeStyle = note.color;
      ctx.lineWidth = spread * 2;
      outline();
      ctx.stroke();
    }
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = note.color;
  outline();
  ctx.fill();
  // The white core along the middle — only where the band stands upright: along a leap it would
  // be a white wire across the keys again, which is the look this replaces.
  ctx.clip();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = `rgba(255,255,255,${CORE_WHITE * 0.75})`;
  ctx.lineWidth = Math.max(1, width * 0.32);
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const upright = dx + dy > 0 ? dy / (dx + dy) : 0;
    if (upright < 0.5) continue;
    ctx.globalAlpha = alpha * upright;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  // The lip on the landing edge, where the note is struck — as a block has.
  ctx.globalAlpha = Math.min(1, 0.3 + 0.35 * note.velocity) * fade;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, points[0][0] - width / 2, bottom - 1.5, width, 1.5, 0.75);
  ctx.fill();
  ctx.restore();
}

/** The widest a drum's mark is drawn, px: a kick in a 150px lane is a hit, not a moon. */
const HEAD_MAX = 44;
/** How far a quiet hit shrinks: a hit at velocity 0 is this share of a full one. */
const HEAD_QUIET = 0.68;

/**
 * One drum hit as its own mark (`DrumHead`), its foot on the moment of the hit.
 *
 * Every shape is built about its own centre at a scale `k`, so the halo is the same path drawn
 * larger and fainter — the blocks' two-fill glow, without a blur — and the light inside is one
 * radial gradient: white at the heart of the strike, the piece's colour at its rim.
 */
function paintHead(
  ctx: CanvasRenderingContext2D,
  note: PaintedNote,
  cx: number,
  laneWidth: number,
  bottom: number,
  top: number,
  alpha: number,
  fade: number
) {
  const size = Math.min(laneWidth, HEAD_MAX) * (HEAD_QUIET + (1 - HEAD_QUIET) * note.velocity);
  const half = size / 2;
  // Each shape's height, so its foot can sit on `bottom` and its tail can start over it.
  const tall: Record<DrumHead, number> = {
    cymbal: Math.max(5, size * 0.24),
    openCymbal: Math.max(14, size * 0.62),
    kick: size,
    tom: size * 0.78,
    snare: size * 0.86,
    clap: size * 0.8,
    stick: size * 0.5,
  };
  const head = note.head!;
  const height = tall[head];
  const cy = bottom - height / 2;

  // The hit's length, where it outlasts its mark: a thread up the lane, faint, so a long noise
  // still says how long it rang without turning back into a block.
  if (bottom - top > height + 2) {
    ctx.globalAlpha = alpha * 0.32;
    ctx.fillStyle = note.color;
    roundRect(ctx, cx - 1.5, top, 3, bottom - height - top, 1.5);
    ctx.fill();
  }

  const shape = (k: number) => {
    ctx.beginPath();
    const r = half * k;
    switch (head) {
      case 'cymbal': {
        ctx.ellipse(cx, cy, r, (height / 2) * k, 0, 0, Math.PI * 2);
        break;
      }
      case 'openCymbal': {
        // Two plates, the top one tipped: the gap between them is what "open" means.
        const plate = Math.max(2.4, size * 0.11) * k;
        ctx.ellipse(cx, bottom - plate, r, plate, 0, 0, Math.PI * 2);
        ctx.moveTo(cx + r, bottom - height + plate);
        ctx.ellipse(cx, bottom - height + plate, r, plate, -0.12, 0, Math.PI * 2);
        break;
      }
      case 'kick':
      case 'tom':
      case 'snare': {
        ctx.arc(cx, cy, (height / 2) * k, 0, Math.PI * 2);
        break;
      }
      case 'clap': {
        // A four-pointed burst: the crack of two hands, not a body.
        const R = (height / 2) * k;
        const waist = R * 0.34;
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4 - Math.PI / 2;
          const reach = i % 2 === 0 ? R : waist;
          const px = cx + Math.cos(angle) * reach;
          const py = cy + Math.sin(angle) * reach;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
      case 'stick': {
        // A stick laid across the hoop, leaning.
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.5);
        const len = r * 1.1;
        const thick = Math.max(2.5, size * 0.09) * k;
        if (typeof ctx.roundRect === 'function')
          ctx.roundRect(-len, -thick, len * 2, thick * 2, thick);
        else ctx.rect(-len, -thick, len * 2, thick * 2);
        ctx.restore();
        break;
      }
    }
  };

  ctx.fillStyle = note.color;
  for (const [k, strength] of [
    [1.5, GLOW_ALPHA * 0.55],
    [1.22, GLOW_ALPHA],
  ] as const) {
    ctx.globalAlpha = Math.min(1, alpha * strength);
    shape(k);
    ctx.fill();
  }
  ctx.globalAlpha = alpha;
  shape(1);
  ctx.fill();

  ctx.save();
  ctx.clip();
  const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(half, height / 2));
  light.addColorStop(0, `rgba(255,255,255,${CORE_WHITE})`);
  light.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  light.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fillRect(cx - half * 1.6, bottom - height - 4, half * 3.2, height + 8);
  ctx.restore();

  // A drumhead has a hoop; the snare's is the bright one — the rim the stick cracks against.
  if (head === 'snare' || head === 'tom' || head === 'kick') {
    ctx.globalAlpha = alpha * (head === 'snare' ? 0.95 : 0.5);
    ctx.strokeStyle = head === 'snare' ? '#ffffff' : note.color;
    ctx.lineWidth = head === 'snare' ? 1.6 : 2;
    ctx.beginPath();
    ctx.arc(cx, cy, height / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  // A cymbal's bell, the bump at its middle.
  if (head === 'cymbal' || head === 'openCymbal') {
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = '#ffffff';
    const bellY = head === 'cymbal' ? cy : bottom - height + Math.max(2.4, size * 0.11);
    ctx.beginPath();
    ctx.ellipse(
      cx,
      bellY - 0.5,
      Math.max(2, size * 0.09),
      Math.max(1.2, size * 0.04),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
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
  regions = [],
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

  for (const region of regions) paintRegion(ctx, region, hitY);

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
    if (note.head) {
      paintHead(ctx, note, column.x + column.width / 2, w, bottom, top, alpha, fade);
      continue;
    }
    // A vibrato shakes like a plucked string — once it is struck: falling, it is the shape the
    // driver plays, still; from the moment it reaches its key it swings, and since the swing starts
    // from that same shape, the strike is where the shaking begins. Shaking all the way down, every
    // vibrato on screen was a wriggling worm long before it sounded. On the music's clock, so a
    // paused string is still too.
    const bend =
      note.bend && time >= note.start && isVibrato(note.bend)
        ? stringAt(note.bend, time - note.start)
        : note.bend;
    if (bend && note.bend && semitonePx && trailPeak(note.bend) >= RIBBON_FROM) {
      paintRibbon(
        ctx,
        note,
        bend,
        column.x + column.width / 2,
        bottom,
        full,
        semitonePx,
        w,
        alpha,
        fade
      );
      continue;
    }
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

    if (bend) {
      ctx.globalAlpha = fade;
      // Weighted by the curve the driver played, not the string's swing — or the line would blink
      // every time the string passed through straight.
      const peak = trailPeak(note.bend ?? bend);
      paintTrail(ctx, bend, column.x + column.width / 2, bottom, full, semitonePx ?? w, peak);
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
): {
  notes: PaintedNote[];
  lit: Map<number, LitLane>;
  glide: Map<number, string>;
} {
  const notes = visibleNotes(sorted, time, lookAhead, maxDuration);
  // The keys a sounding slide has passed over so far — a soft glow on each (`glide`), fading as a
  // released key does. Lighting only the key under the pitch NOW showed nothing on the slides that
  // matter most: Alien 3's triangle drums fall 7–28 semitones into their key in two or three
  // frames, gone before a glow could be seen. Lit along the whole way it came, the fall leaves a
  // streak on the keyboard; a slow glissando is followed key by key.
  const glide = new Map<number, string>();

  // Two voices on one lane: the louder one owns the flash, so a doubled melody
  // does not flicker between two colours from one frame to the next.
  const lit = new Map<number, LitLane>();
  for (const note of notes) {
    if (note.start > time || note.start + note.duration <= time) continue;
    // A muted note is not sounding, so it lights nothing. On a lane shared with
    // an audible voice the audible one still lights it, which is the truth.
    if (note.dimmed) continue;
    if (note.bend && trailPeak(note.bend) >= RIBBON_FROM && note.duration > 0) {
      for (const offset of passedOver(note.bend, (time - note.start) / note.duration)) {
        if (offset !== 0) glide.set(note.lane + offset, note.color);
      }
    }
    const current = lit.get(note.lane);
    if (current && current.velocity >= note.velocity) continue;
    lit.set(note.lane, {
      color: note.color,
      start: note.start,
      velocity: note.velocity,
    });
  }
  return { notes, lit, glide };
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

/** One `LaneRegion`, behind everything that falls. */
function paintRegion(ctx: CanvasRenderingContext2D, region: LaneRegion, hitY: number): void {
  ctx.save();
  const tint = ctx.createLinearGradient(0, 0, 0, hitY);
  tint.addColorStop(0, `rgba(${region.rgb}, 0.05)`);
  tint.addColorStop(1, `rgba(${region.rgb}, 0.16)`);
  ctx.fillStyle = tint;
  ctx.fillRect(region.x, 0, region.width, hitY);
  const lineX = Math.round(region.edge === 'left' ? region.x : region.x + region.width) + 0.5;
  ctx.strokeStyle = `rgba(${region.rgb}, 0.75)`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(lineX, 0);
  ctx.lineTo(lineX, hitY);
  ctx.stroke();
  ctx.setLineDash([]);
  if (region.label) {
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = `rgba(${region.rgb}, 0.85)`;
    const text = region.label.toUpperCase();
    if (ctx.measureText(text).width + 8 <= region.width) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(text, region.x + region.width / 2, hitY - 6);
    } else {
      // Up the stretch, from the hit line, beside the dashed line.
      ctx.translate(region.edge === 'left' ? region.x + 4 : region.x + region.width - 4, hitY - 6);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = region.edge === 'left' ? 'top' : 'bottom';
      ctx.fillText(text, 0, 0);
    }
  }
  ctx.restore();
}
