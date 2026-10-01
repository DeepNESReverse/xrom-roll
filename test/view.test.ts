// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RollView, type RollNote, type RollSurface, type SurfaceLayout } from '../src/index.js';

let clears = 0;
beforeAll(() => {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get: (t: Record<string | symbol, unknown>, k) => (k in t ? t[k] : k === 'clearRect' ? () => clears++ : k === 'createLinearGradient' || k === 'createPattern' ? () => gradient : noop),
    set: (t, k, v) => ((t[k] = v), true),
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

/** Three lanes in a row, 100px each — the smallest surface there is. */
function lanes(strike?: RollSurface['strike'], sounding?: RollSurface['sounding']) {
  const element = document.createElement('div');
  const nodes = new Map<number, HTMLElement>();
  for (const lane of [0, 1, 2]) {
    const node = document.createElement('div');
    element.append(node);
    nodes.set(lane, node);
  }
  const columns = new Map([0, 1, 2].map((lane) => [lane, { x: lane * 100, width: 100 }]));
  const layout = vi.fn((): SurfaceLayout => ({ fallHeight: 200, columns, nodes }));
  const surface: RollSurface = { element, layout, strike, sounding };
  return { surface, nodes, layout };
}

function view(surface: RollSurface, notes: RollNote[], onSoundingChange?: (l: readonly number[]) => void) {
  const host = document.createElement('div');
  document.body.append(host);
  const v = new RollView(host, surface, { sparks: false, onSoundingChange });
  (v as unknown as { resize(w: number, h: number): void }).resize(300, 260);
  v.setNotes(notes);
  return v;
}

describe('RollView', () => {
  it('lights a lane while its note sounds, in the note’s colour', () => {
    const { surface, nodes } = lanes();
    const v = view(surface, [{ lane: 1, start: 0, duration: 1, color: '#abcdef' }]);
    v.render(0.5);
    expect(nodes.get(1)!.dataset.lit).toBe('1');
    expect(nodes.get(1)!.style.getPropertyValue('--flash')).toBe('#abcdef');
    expect(nodes.get(0)!.dataset.lit).toBeUndefined();
    v.render(1.5);
    expect(nodes.get(1)!.dataset.lit).toBe('0');
  });

  it('tells the surface about every strike, and whether the lane was already sounding', () => {
    const strike = vi.fn();
    const { surface } = lanes(strike);
    const v = view(surface, [
      { lane: 2, start: 0, duration: 0.5 },
      { lane: 2, start: 0.5, duration: 0.5 },
    ]);
    v.render(0.25);
    v.render(0.75);
    expect(strike).toHaveBeenCalledTimes(2);
    expect(strike.mock.calls[0][3]).toBe(false);
    expect(strike.mock.calls[1][3]).toBe(true);
  });

  it('reports the sounding set only when it changes', () => {
    const sounding = vi.fn();
    const changes = vi.fn();
    const { surface } = lanes(undefined, sounding);
    const v = view(surface, [{ lane: 0, start: 0, duration: 1 }, { lane: 2, start: 0, duration: 1 }], changes);
    v.render(0.1);
    v.render(0.2);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(changes).toHaveBeenLastCalledWith([0, 2]);
    expect(sounding).toHaveBeenCalledTimes(1);
  });

  it('draws nothing while the clock stands still', () => {
    const { surface } = lanes();
    const v = view(surface, [{ lane: 0, start: 0, duration: 1 }]);
    v.render(0.5);
    const before = clears;
    v.render(0.5);
    v.render(0.5);
    expect(clears).toBe(before);
    v.render(0.6);
    expect(clears).toBe(before + 1);
  });

  it('asks the surface for its layout when the notes change, not every frame', () => {
    const { surface, layout } = lanes();
    const v = view(surface, [{ lane: 0, start: 0, duration: 1 }]);
    const after = layout.mock.calls.length;
    for (let t = 0; t < 1; t += 0.1) v.render(t);
    expect(layout.mock.calls.length).toBe(after);
  });
});
