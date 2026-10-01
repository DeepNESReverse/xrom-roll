/**
 * Notes falling onto lanes, in a DOM element.
 *
 * `RollView` is the part every roll shares — a canvas the blocks fall down,
 * the frame loop, sparks, and lighting the lanes as their notes land — and
 * knows nothing about what a lane IS. That is a `RollSurface`'s job: the
 * keyboard of `@xromdev/pianoroll`, the drum kit of `@xromdev/drumroll`, or
 * anything else that can say where its lanes are.
 *
 * The whole view is one reading of time: the bottom of the falling area is NOW
 * and its top is `now + lookAhead`, so a block's bottom edge touches its lane
 * at the instant the note sounds and its length IS the duration.
 *
 * A frame never goes through a framework: `render` paints the canvas and
 * writes to a lane's element only where that lane changed. Paused (the same
 * time as the last frame) or scrolled out of view, it does nothing at all.
 */

import { frameOf, paintRoll, type Guide, type LaneBackdrop, type LaneColumn, type LitLane, type PaintedNote, type PitchCurve } from './paint.js';
import { burst, stepSparks, type Spark } from './sparks.js';
import { OTHER, resolveTracks, type TrackStyle } from './tracks.js';

export interface RollNote {
  /** Which lane it falls down — a key's MIDI number, a drum's id, anything the surface lays out. */
  lane: number;
  /** When it sounds, in seconds from the start of the piece. */
  start: number;
  /** How long it sounds, in seconds. */
  duration: number;
  /** Which voice it belongs to — picks the colour, unless `color` is given. */
  track?: string;
  /** Its own colour, over its track's. */
  color?: string;
  /** 0..1. Sets the block's weight and the flash's strength. Default 1. */
  velocity?: number;
  /** Shown but not heard — muted. Faded, and it lights no lane. */
  dimmed?: boolean;
  /** Vibrato, a bend or a slide: `[position 0..1, semitones]`, drawn along the block. */
  bend?: PitchCurve;
}

/** Where everything is, for one size of the view — what a surface hands back. */
export interface SurfaceLayout {
  /** Height of the falling area; the surface's element takes the rest. */
  fallHeight: number;
  /** Lane → where it sits across the width. */
  columns: ReadonlyMap<number, LaneColumn>;
  /** Lane → the element lit while it sounds (`data-lit`, `--flash`). */
  nodes: ReadonlyMap<number, HTMLElement>;
  guides?: readonly Guide[];
  backdrops?: readonly LaneBackdrop[];
  /** Pixels for one semitone, for drawing bends. */
  semitonePx?: number;
}

/**
 * What goes under the falling area.
 *
 * `layout` is called when the size, the notes or the options change — not
 * every frame — and may rebuild its DOM or keep it.
 */
export interface RollSurface<Options = unknown> {
  /** The surface's own element, placed under the canvas. */
  readonly element: HTMLElement;
  /** Class for the view's root element, for the surface's CSS. */
  readonly rootClass?: string;
  layout(width: number, height: number, notes: readonly RollNote[], options: Options): SurfaceLayout;
  /**
   * A note just landed on `lane`. `repeat`: the lane was already sounding — a
   * note written twice with no gap, which no state change can show, so a
   * surface that wants it seen has to animate it.
   */
  strike?(lane: number, node: HTMLElement, note: LitLane, repeat: boolean): void;
  /** The set of sounding lanes changed (not every frame). */
  sounding?(lanes: readonly number[], lit: ReadonlyMap<number, LitLane>): void;
  destroy?(): void;
}

export interface RollOptions {
  /** Seconds of music visible above the lanes — the fall speed. Default 2.5. */
  lookAhead?: number;
  /** Colour, label and texture per track, over `DEFAULT_TRACKS`. */
  tracks?: Record<string, TrackStyle>;
  /** How long a lane keeps glowing after its note ends, in ms. Default 320. */
  releaseMs?: number;
  /** Break a landing block into sparks. Default true. */
  sparks?: boolean;
  /** Called when the SET of sounding lanes changes — not every frame. */
  onSoundingChange?: (lanes: readonly number[]) => void;
}

/** What the view last wrote to one lane, so a frame writes only what changed. */
interface LaneState {
  node: HTMLElement;
  lit: boolean;
  color: string;
  /** Start of the note that lit it: a new start is a new strike. */
  start: number;
}

export class RollView<Options extends RollOptions = RollOptions> {
  /** The view's own element, inside the host it was given. */
  readonly element: HTMLDivElement;
  protected readonly surface: RollSurface<Options>;
  protected options: Options;
  private readonly canvas: HTMLCanvasElement;
  private notes: readonly RollNote[] = [];
  private painted: PaintedNote[] = [];
  private maxDuration = 0;
  private styles = new Map<string, TrackStyle>();

  private width = 0;
  private height = 0;
  private layoutNow: SurfaceLayout | null = null;
  private lanes = new Map<number, LaneState>();

  private time = 0;
  private sparkPool: Spark[] = [];
  private sparkTime: number | null = null;
  private readonly observer: ResizeObserver | null;
  private readonly visibility: IntersectionObserver | null;
  /** Off screen: nothing is drawn until it scrolls back. */
  private visible = true;
  /** Something other than the time changed since the last frame drawn. */
  private dirty = true;
  /** The time the canvas last showed; NaN before the first frame. */
  private drawnTime = NaN;
  private raf = 0;

  constructor(host: HTMLElement, surface: RollSurface<Options>, options: Options) {
    this.surface = surface;
    this.options = options;
    const doc = host.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = surface.rootClass ?? 'xroll';
    this.element.style.position = 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.height = '100%';
    this.canvas = doc.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.element.append(this.canvas, surface.element);
    host.append(this.element);

    this.applyOptions();
    this.observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
    this.observer?.observe(this.element);
    this.visibility =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            this.visible = entry.isIntersecting;
            if (this.visible) this.redraw();
          });
    this.visibility?.observe(this.element);
    this.resize(this.element.clientWidth, this.element.clientHeight);
  }

  /** The notes of the piece, in any order. */
  setNotes(notes: readonly RollNote[]) {
    this.notes = notes;
    this.styles = resolveTracks(notes, this.options.tracks);
    const painted: PaintedNote[] = notes.map((note) => {
      const style = this.styles.get(note.track ?? 'default');
      return {
        lane: note.lane,
        start: note.start,
        duration: note.duration,
        velocity: note.velocity ?? 1,
        color: note.color ?? style?.color ?? OTHER,
        hatch: style?.hatch ?? false,
        dimmed: note.dimmed,
        bend: note.bend,
      };
    });
    painted.sort((a, b) => a.start - b.start);
    this.painted = painted;
    let longest = 0;
    for (const note of painted) if (note.duration > longest) longest = note.duration;
    this.maxDuration = longest;
    this.sparkPool = [];
    this.relayout();
    this.redraw();
  }

  /** Change any options; the rest keep their values. */
  setOptions(options: Partial<Options>) {
    const tracksChanged = options.tracks !== undefined && options.tracks !== this.options.tracks;
    this.options = { ...this.options, ...options };
    this.applyOptions();
    if (tracksChanged) this.setNotes(this.notes);
    else {
      this.relayout();
      this.redraw();
    }
  }

  /** Each track's resolved colour and label — for a legend. */
  get trackStyles(): ReadonlyMap<string, TrackStyle> {
    return this.styles;
  }

  /** Follow a clock: render `clock()` on every animation frame until `stop()`. */
  play(clock: () => number) {
    this.stop();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.render(clock());
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.stop();
    this.observer?.disconnect();
    this.visibility?.disconnect();
    this.surface.destroy?.();
    this.element.remove();
  }

  /** Draw the current moment again — after anything but time changed. */
  protected redraw() {
    this.dirty = true;
    this.render(this.time);
  }

  private applyOptions() {
    this.element.style.setProperty('--flash-release', `${this.options.releaseMs ?? 320}ms`);
  }

  private resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.relayout();
    this.redraw();
  }

  /** Ask the surface where everything is, and take over the lanes it hands back. */
  protected relayout() {
    const layout = this.surface.layout(this.width, this.height, this.notes, this.options);
    this.canvas.style.height = `${layout.fallHeight}px`;
    const before = this.layoutNow?.nodes;
    this.layoutNow = layout;
    if (before === layout.nodes) return;
    // New elements: start them all dark, as the DOM they are.
    const lanes = new Map<number, LaneState>();
    for (const [lane, node] of layout.nodes) lanes.set(lane, { node, lit: false, color: '', start: NaN });
    this.lanes = lanes;
  }

  /** Draw the moment `time`, in seconds from the start of the piece. */
  render(time: number) {
    this.time = time;
    // Nothing to do: the same moment as the canvas already shows (a paused
    // clock — the sparks age on the piece's clock too, so they are still) and
    // nothing else changed, or no one can see it.
    if (!this.visible) return;
    if (time === this.drawnTime && !this.dirty) return;
    const layout = this.layoutNow;
    const width = this.width;
    const height = layout?.fallHeight ?? 0;
    if (!layout || width <= 0 || height <= 0) return;

    const canvas = this.canvas;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawnTime = time;
    this.dirty = false;

    const lookAhead = this.options.lookAhead ?? 2.5;
    const { notes, lit } = frameOf(this.painted, time, lookAhead, this.maxDuration);

    const sparks = this.options.sparks !== false;
    if (sparks) {
      const previous = this.sparkTime;
      const dt = previous === null ? 0 : time - previous;
      this.sparkTime = time;
      // A seek or a loop is not elapsed time: clear rather than age by it.
      this.sparkPool = dt < 0 || dt > 0.5 ? [] : stepSparks(this.sparkPool, dt);
    } else if (this.sparkPool.length) this.sparkPool = [];

    paintRoll({
      ctx,
      width,
      height,
      columns: layout.columns,
      guides: layout.guides,
      backdrops: layout.backdrops,
      notes,
      time,
      lookAhead,
      lit,
      sparks: this.sparkPool,
      semitonePx: layout.semitonePx,
    });

    // Then the lanes, written only where they changed. A new strike's sparks
    // join the pool here and are drawn from the next frame, as they rise.
    let soundingChanged = false;
    for (const [lane, state] of this.lanes) {
      const note = lit.get(lane);
      if (!note) {
        if (state.lit) {
          state.node.dataset.lit = '0';
          state.lit = false;
          state.start = NaN;
          soundingChanged = true;
        }
        continue;
      }
      const repeat = state.lit;
      const struck = state.start !== note.start;
      if (state.color !== note.color) {
        state.node.style.setProperty('--flash', note.color);
        state.color = note.color;
      }
      if (!state.lit) {
        state.node.dataset.lit = '1';
        state.lit = true;
        soundingChanged = true;
      }
      if (!struck) continue;
      state.start = note.start;
      this.surface.strike?.(lane, state.node, note, repeat);
      if (sparks) {
        const column = layout.columns.get(lane);
        if (column) {
          const pieces = burst({
            x: column.x + column.width / 2,
            width: column.width,
            color: note.color,
            velocity: note.velocity,
            seed: lane * 1000 + note.start,
          });
          for (const piece of pieces) this.sparkPool.push(piece);
        }
      }
    }

    if (soundingChanged) {
      const now: number[] = [];
      for (const [lane, state] of this.lanes) if (state.lit) now.push(lane);
      now.sort((a, b) => a - b);
      this.surface.sounding?.(now, lit);
      this.options.onSoundingChange?.(now);
    }
  }
}
