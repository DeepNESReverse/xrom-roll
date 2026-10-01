/**
 * Track colours: which voice a note belongs to picks its colour.
 */

import type { RollNote } from './view.js';

export interface TrackStyle {
  /** Any CSS colour. */
  color: string;
  /** Name for a legend. Defaults to the track's key. */
  label?: string;
  /** Hatch the blocks as well as colouring them — identity without hue. */
  hatch?: boolean;
}

/**
 * Colours for the NES's four tone channels, from a palette checked for
 * colour-blind separation on a dark background; `noise` is hatched as well,
 * since under protanopia it comes closest to its neighbours.
 */
export const DEFAULT_TRACKS: Record<string, TrackStyle> = {
  pulse1: { color: '#3987e5', label: 'pulse 1' },
  pulse2: { color: '#c98500', label: 'pulse 2' },
  triangle: { color: '#d55181', label: 'triangle' },
  noise: { color: '#008300', label: 'noise', hatch: true },
};

/** Handed in this order to tracks nothing names. */
export const PALETTE_SLOTS = ['#3987e5', '#c98500', '#d55181', '#008300'];
/** Past the four checked slots a new hue would be a guess, so the rest share one. */
export const OTHER = '#8a8a99';
/**
 * Every track in the notes with its resolved style — named tracks first, in
 * the order declared, then the rest as they appear. For drawing a legend.
 */
export function resolveTracks(
  notes: readonly Pick<RollNote, 'track'>[],
  overrides?: Record<string, TrackStyle>
): Map<string, TrackStyle> {
  const resolved = new Map<string, TrackStyle>();
  const used = new Set<string>();
  const claim = (name: string, style: TrackStyle) => {
    resolved.set(name, { label: name, ...style });
    used.add(style.color);
  };
  const present = new Set<string>();
  for (const note of notes) present.add(note.track ?? 'default');
  const declared = [...Object.keys(overrides ?? {}), ...Object.keys(DEFAULT_TRACKS)];
  const seen = [
    ...declared.filter((name, i) => present.has(name) && declared.indexOf(name) === i),
    ...[...present].filter((name) => !declared.includes(name)),
  ];
  for (const name of seen) {
    const preset = overrides?.[name] ?? DEFAULT_TRACKS[name];
    if (preset) claim(name, preset);
  }
  for (const name of seen) {
    if (resolved.has(name)) continue;
    claim(name, { color: PALETTE_SLOTS.find((c) => !used.has(c)) ?? OTHER });
  }
  return resolved;
}

