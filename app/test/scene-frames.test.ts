import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LootArc } from '@wanderblade/core';
import { createScene, type SceneModel } from '../src/scene/scene';

/**
 * Every 2d-context call the scene makes, across every canvas it creates, in
 * order. A refactor that moves draw code between modules must leave this
 * byte-identical: the hash is the pixel-identity proof, and the WB_SCENE_DUMP
 * env var writes the full call list somewhere it can be diffed.
 */
class Recorder {
  readonly calls: string[] = [];
  private nextId = 0;

  canvas(cssW = 0, cssH = 0): HTMLCanvasElement {
    const id = this.nextId++;
    const state: Record<string | symbol, unknown> = {};
    const calls = this.calls;
    const fmt = (v: unknown): string => {
      if (v && typeof v === 'object' && 'wbCanvasId' in v) return `c${String((v as { wbCanvasId: number }).wbCanvasId)}`;
      if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(15);
      return JSON.stringify(v);
    };
    const ctx = new Proxy(state, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return (...args: unknown[]) => {
          calls.push(`c${id}.${String(prop)}(${args.map(fmt).join(',')})`);
        };
      },
      set(target, prop, value) {
        target[prop] = value;
        calls.push(`c${id}.${String(prop)}=${fmt(value)}`);
        return true;
      },
    });
    const canvas = {
      wbCanvasId: id,
      width: 0,
      height: 0,
      clientWidth: cssW,
      clientHeight: cssH,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: cssW, height: cssH }),
      getContext: () => ctx,
    };
    return new Proxy(canvas, {
      set(target, prop, value) {
        (target as Record<string | symbol, unknown>)[prop] = value;
        if (prop === 'width' || prop === 'height') calls.push(`c${id}.${prop}=${fmt(value)}`);
        return true;
      },
    }) as unknown as HTMLCanvasElement;
  }

  digest(): { calls: number; sha256: string } {
    return {
      calls: this.calls.length,
      sha256: createHash('sha256').update(this.calls.join('\n')).digest('hex'),
    };
  }
}

function installDom(rec: Recorder): void {
  vi.stubGlobal('document', { createElement: () => rec.canvas() });
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

function baseModel(over: Partial<SceneModel> = {}): SceneModel {
  return {
    region: 0,
    kills: 0,
    killProgress: 0,
    goldPerKill: 12,
    dps: 40,
    momentum: 0,
    momentumMult: 1,
    attackSpeedMult: 1,
    paused: false,
    reduceMotion: false,
    boss: false,
    arcs: [],
    timeSec: 100,
    ...over,
  };
}

function arcsAt(timeSec: number): LootArc[] {
  return [
    { gold: 10, expiresAtSec: timeSec + 0.9, landingX: 3, gear: null },
    { gold: 10, expiresAtSec: timeSec + 0.3, landingX: 2.2, gear: null },
  ];
}

/** Advances the scene `n` frames, ramping kills and progress so the queue, swing and death FX all fire. */
function playRoad(
  scene: ReturnType<typeof createScene>,
  n: number,
  over: Partial<SceneModel>,
): void {
  for (let i = 0; i < n; i++) {
    const timeSec = 100 + i / 30;
    scene.frame(1 / 30, baseModel({
      ...over,
      kills: over.kills ?? Math.floor(i / 12),
      killProgress: (i % 12) / 12,
      momentum: Math.min(1, i / 40),
      momentumMult: 1 + Math.min(1, i / 40) * 0.75,
      attackSpeedMult: 1 + Math.min(1, i / 40) * 0.75,
      arcs: i > 6 ? arcsAt(timeSec) : [],
      timeSec,
    }));
  }
}

function maybeDump(name: string, rec: Recorder): void {
  const dir = process.env['WB_SCENE_DUMP'];
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.txt`), rec.calls.join('\n'));
}

describe('scene frames are pixel-identical across refactors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('road, mid-swing, with a strike, a catch and coins in flight (landscape, docked panel)', () => {
    const rec = new Recorder();
    installDom(rec);
    const scene = createScene(rec.canvas(900, 500));
    scene.setSceneRight(240);
    scene.setCollectAnchor(60, 20);
    playRoad(scene, 40, {});
    scene.strikeAt(520, 300);
    playRoad(scene, 2, { kills: 3 });
    scene.catchArc(12.5, true);
    scene.strikeAt(null, null);
    playRoad(scene, 4, { kills: 3 });
    scene.frame(1 / 30, baseModel({ kills: 3, paused: true }));
    scene.dispose();
    maybeDump('road', rec);
    expect(rec.digest()).toMatchSnapshot();
  });

  it('dungeon: the guardian walks out of its portal and is struck (landscape)', () => {
    const rec = new Recorder();
    installDom(rec);
    const scene = createScene(rec.canvas(900, 500));
    scene.setSceneRight(240);
    scene.setCollectAnchor(60, 20);
    playRoad(scene, 6, { region: 1 });
    playRoad(scene, 40, { region: 1, boss: true, kills: 5 });
    scene.strikeAt(520, 300);
    playRoad(scene, 3, { region: 1, boss: true, kills: 5 });
    scene.dispose();
    maybeDump('dungeon', rec);
    expect(rec.digest()).toMatchSnapshot();
  });

  it('reduce-motion road in portrait, with chrome above the band', () => {
    const rec = new Recorder();
    installDom(rec);
    const scene = createScene(rec.canvas(390, 700));
    scene.setSceneTop(220);
    scene.setCollectAnchor(40, 60);
    playRoad(scene, 30, { region: 2, reduceMotion: true });
    scene.strikeAt(200, 500);
    playRoad(scene, 3, { region: 2, reduceMotion: true });
    scene.setSceneTop(180);
    playRoad(scene, 2, { region: 2, reduceMotion: true });
    scene.dispose();
    maybeDump('reduce-motion', rec);
    expect(rec.digest()).toMatchSnapshot();
  });
});
