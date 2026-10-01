# @xromdev/roll

Notes falling onto lanes — **the core under
[@xromdev/pianoroll](https://github.com/DeepNESReverse/xrom-pianoroll) and
[@xromdev/drumroll](https://github.com/DeepNESReverse/xrom-drumroll)**: canvas
blocks, sparks, lighting the lanes and the frame loop, with no framework in it.

- A block's bottom edge touches its lane at the instant the note sounds; its
  length is the duration, its colour the voice, its weight the velocity;
  vibrato and slides are drawn as the curve itself.
- The lanes are a **surface** you hand it — a keyboard, a drum kit, anything
  that can say where each lane is. The core paints the falling area, and tells
  the surface which lanes light up and when one is struck.
- Fast by construction: one canvas paint a frame plus DOM writes only for the
  lanes that changed, and **nothing at all** while the clock is paused or the
  roll is scrolled out of view.
- ~4 KB minified and gzipped.

**See it: [xrom.dev/utils/pianoroll](https://xrom.dev/utils/pianoroll) and
[xrom.dev/utils/drumroll](https://xrom.dev/utils/drumroll).**

## Install

```sh
npm install @xromdev/roll
```

You only need this package directly to build a roll of your own; the piano and
the drums re-export what they use from it.

## Your own lanes

```ts
import { RollView, type RollSurface } from '@xromdev/roll';

const strip: RollSurface = {
  element: document.createElement('div'),
  layout(width, height, notes) {
    const lanes = [...new Set(notes.map((n) => n.lane))].sort((a, b) => a - b);
    const w = width / Math.max(1, lanes.length);
    const nodes = new Map<number, HTMLElement>();
    this.element.replaceChildren(
      ...lanes.map((lane, i) => {
        const pad = document.createElement('div');
        pad.style.cssText = `position:absolute;bottom:0;left:${i * w}px;width:${w}px;height:40px`;
        nodes.set(lane, pad);
        return pad;
      })
    );
    return {
      fallHeight: height - 40,
      columns: new Map(lanes.map((lane, i) => [lane, { x: i * w, width: w }])),
      nodes, // the core sets data-lit and --flash on these
    };
  },
};

const roll = new RollView(document.querySelector('#roll')!, strip, { lookAhead: 2 });
roll.setNotes([
  { lane: 0, start: 0, duration: 0.5, track: 'lead' },
  { lane: 1, start: 0.5, duration: 0.25, track: 'bass', velocity: 0.6 },
]);
roll.play(() => audioContext.currentTime - startedAt); // or roll.render(seconds)
```

A surface may also implement `strike(lane, node, note, repeat)` — a note just
landed — and `sounding(lanes, lit)` — the set of sounding lanes changed — to
animate its own pieces, and return `guides`, `backdrops` and `semitonePx` from
`layout` for lines, lane columns and how far a bend of one semitone moves.

## Notes

```ts
interface RollNote {
  lane: number;
  start: number;       // seconds
  duration: number;    // seconds
  track?: string;      // which voice; picks the colour
  color?: string;      // or set it directly
  velocity?: number;   // 0..1, default 1
  dimmed?: boolean;    // shown faded, lights nothing (a muted voice)
  bend?: [number, number][]; // [0..1 through the note, semitones]
}
```

## Options

| option | default | |
|---|---|---|
| `lookAhead` | 2.5 | Seconds of music above the lanes — the fall speed. |
| `tracks` | NES channels | `{ [track]: { color, label?, hatch? } }` over the defaults. |
| `releaseMs` | 320 | How long a lane keeps glowing after its note ends. |
| `sparks` | true | Landing blocks break into sparks. |
| `onSoundingChange` | — | Called when the set of sounding lanes changes, not every frame. |

Also exported: `paintRoll` (the falling area on your own canvas), `frameOf`,
`burst` / `stepSparks`, `resolveTracks` for a legend.

## Development

```sh
npm install
npm test   # painting, sparks, and the view in jsdom
```

## License

MIT © Oleksandr Maksymov
