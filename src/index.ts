/**
 * @xromdev/roll — notes falling onto lanes, the core every roll shares.
 *
 * `RollView` runs the whole frame — canvas blocks, sparks, lighting the lanes —
 * over a `RollSurface` that says where the lanes are: the keyboard of
 * `@xromdev/pianoroll`, the drum kit of `@xromdev/drumroll`, or your own.
 * `paintRoll` is the falling area alone, for a canvas you drive yourself.
 */

export { RollView, type RollNote, type RollOptions, type RollSurface, type SurfaceLayout } from './view.js';
export { DEFAULT_TRACKS, OTHER, PALETTE_SLOTS, resolveTracks, type TrackStyle } from './tracks.js';
export {
  frameOf,
  paintRoll,
  trailPeak,
  trailPoints,
  visibleNotes,
  type Guide,
  type LaneBackdrop,
  type LaneColumn,
  type LitLane,
  type PaintInput,
  type PaintedNote,
  type PitchCurve,
} from './paint.js';
export { MAX_SPARKS, burst, stepSparks, type BurstOptions, type Spark } from './sparks.js';
