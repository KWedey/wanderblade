import type { SceneModel } from '../src/scene/frame';

/** A resting road frame; every field is display-only, so any test may override any of them. */
export function sceneModel(over: Partial<SceneModel> = {}): SceneModel {
  return {
    region: 0,
    zone: 0,
    zonesInRealm: 50,
    kills: 0,
    killProgress: 0,
    goldPerKill: 0,
    dps: 0,
    momentum: 0,
    momentumMult: 1,
    attackSpeedMult: 1,
    paused: false,
    reduceMotion: false,
    boss: false,
    arcs: [],
    timeSec: 0,
    ...over,
  };
}
