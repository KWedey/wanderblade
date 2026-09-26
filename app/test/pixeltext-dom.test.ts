// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markPixelDirty, repaintPixelText } from '../src/pixeltext';

// A changed-only repaint must decide "nothing to draw" before it reads a single
// computed style; that read is the layout cost the panel pays per leaf.
describe('repaintPixelText with changedOnly', () => {
  let root: HTMLElement;
  let alpha: HTMLElement;
  let beta: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.innerHTML = '<span class="alpha">Alpha</span><span class="beta">Beta</span>';
    document.body.appendChild(root);
    alpha = root.querySelector('.alpha')!;
    beta = root.querySelector('.beta')!;
    repaintPixelText(root);
  });

  afterEach(() => {
    root.remove();
    vi.restoreAllMocks();
  });

  it('tags every leaf and gives each its accessible span on the first paint', () => {
    expect(alpha.dataset['px']).toBe('');
    expect(beta.dataset['px']).toBe('');
    expect(alpha.querySelector('.px-sr')?.textContent).toBe('Alpha');
  });

  it('reads no style at all when nothing changed', () => {
    const styles = vi.spyOn(window, 'getComputedStyle');
    repaintPixelText(root, true);
    expect(styles).not.toHaveBeenCalled();
  });

  it('measures only the leaf whose text was reassigned', () => {
    const styles = vi.spyOn(window, 'getComputedStyle');
    alpha.textContent = 'Gamma';
    repaintPixelText(root, true);
    expect(styles).toHaveBeenCalledTimes(1);
    expect(styles.mock.calls[0]![0]).toBe(alpha);
    expect(alpha.querySelector('.px-sr')?.textContent).toBe('Gamma');
  });

  it('measures a flagged leaf even though its text is unchanged', () => {
    const styles = vi.spyOn(window, 'getComputedStyle');
    markPixelDirty(beta);
    repaintPixelText(root, true);
    expect(styles).toHaveBeenCalledTimes(1);
    expect(styles.mock.calls[0]![0]).toBe(beta);
    // The flag is consumed by the paint, not carried into the next one.
    repaintPixelText(root, true);
    expect(styles).toHaveBeenCalledTimes(1);
  });

  it('flags every leaf under a container', () => {
    const styles = vi.spyOn(window, 'getComputedStyle');
    markPixelDirty(root);
    repaintPixelText(root, true);
    expect(styles).toHaveBeenCalledTimes(2);
  });

  it('measures everything on a full repaint', () => {
    const styles = vi.spyOn(window, 'getComputedStyle');
    repaintPixelText(root);
    expect(styles).toHaveBeenCalledTimes(2);
  });

  it('paints a leaf that appeared since the last pass', () => {
    const styles = vi.spyOn(window, 'getComputedStyle');
    const gamma = document.createElement('span');
    gamma.textContent = 'Gamma';
    root.appendChild(gamma);
    repaintPixelText(root, true);
    expect(styles.mock.calls.map((c) => c[0])).toEqual([gamma, gamma]);
    expect(gamma.dataset['px']).toBe('');
  });

  it('measures a leaf whose box changed width even though its text did not', () => {
    // A real box lets the layout succeed; jsdom has no 2D context to ink it.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const styles = vi.spyOn(window, 'getComputedStyle');
    Object.defineProperty(alpha, 'clientWidth', { value: 240, configurable: true });
    repaintPixelText(root, true);
    expect(styles.mock.calls.map((c) => c[0])).toEqual([alpha]);
    // Measured in the new box, it is clean again until the box moves once more.
    repaintPixelText(root, true);
    expect(styles).toHaveBeenCalledTimes(1);
  });

  it('spends nothing on a leaf emptied since its last paint', () => {
    alpha.textContent = '';
    repaintPixelText(root, true);
    const styles = vi.spyOn(window, 'getComputedStyle');
    const rects = vi.spyOn(alpha, 'getBoundingClientRect');
    repaintPixelText(root, true);
    expect(styles).not.toHaveBeenCalled();
    expect(rects).not.toHaveBeenCalled();
  });
});
