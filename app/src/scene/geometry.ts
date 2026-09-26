// The scene's pixel grid: how CSS pixels become scene units, where the ground
// and the hero sit, and how much of the canvas the docked chrome hides.

/** Scene units across the viewport, before integer-scale rounding. */
const TARGET_SCENE_WIDTH = 300;
const MIN_PIXEL_SCALE = 2;
const MAX_PIXEL_SCALE = 8;
const HERO_X_FRAC = 0.24;
/** The world band never shrinks below this, however tall the chrome gets. */
const MIN_BAND_H = 60;

export interface Viewport {
  pixelScale: number;
  vw: number;
  vh: number;
  groundY: number;
  /** Scene units the band is pushed down the display canvas by. */
  sceneOffsetY: number;
  /**
   * Lowest scene row the player can actually see. In portrait the panel sheet
   * covers the bottom half, so world-anchored HUD (the momentum meter) has to
   * sit above it rather than at the canvas edge.
   */
  sceneBottomY: number;
  /** Scene x the docked panel starts at: the last column a player can see. */
  worldRightX: number;
  heroX: number;
  /**
   * The height arc-space calls y = 0. Core's arc is y = 4p(1-p): launch and
   * landing sit at the same height, so the scene must launch and land on one
   * line too. Any visual drop from a creature's chest to the ground has to be
   * absorbed by the scene, never passed through as arc-space y.
   */
  arcBaseY: number;
}

/** CSS pixels of chrome above the world band and docked to its right. The view measures both. */
export interface Chrome {
  topCss: number;
  rightCss: number;
}

export function createViewport(): Viewport {
  return {
    pixelScale: 4,
    vw: 100,
    vh: 100,
    groundY: 60,
    sceneOffsetY: 0,
    sceneBottomY: 100,
    worldRightX: 100,
    heroX: 24,
    arcBaseY: 0,
  };
}

/** Device pixels per scene pixel, snapped so the display blit is never fractional. */
export function blitScaleFor(cssW: number, dpr: number, sceneW: number): number {
  return Math.max(1, Math.round(Math.floor(cssW * dpr) / Math.max(1, sceneW)));
}

/** Re-derive the grid from the canvas's CSS box, sizing the buffer and the display canvas to match. */
export function layoutViewport(
  view: Viewport,
  canvas: HTMLCanvasElement,
  buffer: HTMLCanvasElement,
  chrome: Chrome,
  dpr: number,
): void {
  const cssW = Math.max(1, canvas.clientWidth);
  const cssH = Math.max(1, canvas.clientHeight);

  view.pixelScale = Math.max(
    MIN_PIXEL_SCALE,
    Math.min(MAX_PIXEL_SCALE, Math.round(cssW / TARGET_SCENE_WIDTH) || MIN_PIXEL_SCALE),
  );
  view.vw = Math.ceil(cssW / view.pixelScale);
  view.vh = Math.ceil(cssH / view.pixelScale);
  buffer.width = view.vw;
  buffer.height = view.vh;

  // Whole device pixels per scene pixel: the stretch is nearest-neighbour, and
  // a fractional one duplicates columns unevenly.
  const blit = blitScaleFor(cssW, dpr, view.vw);
  canvas.width = view.vw * blit;
  canvas.height = view.vh * blit;

  // Portrait puts the panels above and gives the road the bottom band, so the
  // core verb lives under the thumb; landscape docks the panel right.
  const landscape = cssW / cssH >= 1;
  view.sceneOffsetY = landscape ? 0 : Math.min(view.vh - MIN_BAND_H, Math.round(chrome.topCss / view.pixelScale));
  view.sceneOffsetY = Math.max(0, view.sceneOffsetY);
  const bandH = view.vh - view.sceneOffsetY;
  view.groundY = Math.floor(bandH * (landscape ? 0.72 : 0.66));
  view.arcBaseY = view.groundY - 2;
  view.sceneBottomY = bandH;
  // The panel is docked over the canvas, so the scene is wider than the world
  // anyone can see; creatures queued past this walked on behind the UI.
  view.worldRightX = Math.max(40, view.vw - Math.round(chrome.rightCss / view.pixelScale));
  view.heroX = Math.floor(view.vw * (landscape ? HERO_X_FRAC : 0.3));
}

/** Client coords to scene units inside the world band. */
export function toScene(view: Viewport, canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / view.pixelScale,
    y: (clientY - rect.top) / view.pixelScale - view.sceneOffsetY,
  };
}
