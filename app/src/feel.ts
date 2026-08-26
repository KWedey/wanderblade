// Impact audio and haptics. Every sound is synthesized on an AudioContext, so
// the bundle carries no audio files and a hit costs one oscillator.
//
// Nothing here reads or writes game state: it is fed by events the engine
// already emitted (DECISIONS.md #12).

/** Mixed well under the music-less scene so a fast tapper is not fatiguing. */
const MASTER_GAIN = 0.22;
/** Floor on the gap between two identical cues, so a burst does not buzz. */
const RETRIGGER_SEC = 0.035;
/**
 * Semitone spread either side of a voice's written pitch. Every strike being
 * the identical 320Hz square read as a drone past about six taps a second -
 * the same reason the noise burst exists at all.
 */
const DETUNE_SEMITONES = 2.5;

export type Cue = 'strike' | 'kill' | 'catch' | 'buy' | 'victory';

export interface FeelOptions {
  muted?: boolean;
  haptics?: boolean;
}

interface Voice {
  /** Start and end frequency in Hz — the pitch drop that reads as impact. */
  from: number;
  to: number;
  /** Seconds the body of the sound lasts. */
  decay: number;
  type: OscillatorType;
  gain: number;
  /** Noise burst mixed in, as a fraction of gain. Metal needs it; a chime does not. */
  noise: number;
  /** Milliseconds of vibration, when the device supports it. */
  buzz: number;
}

const VOICES: Record<Cue, Voice> = {
  // A short, low, noisy thud — the blade landing, not a beep.
  strike: { from: 320, to: 90, decay: 0.11, type: 'square', gain: 0.5, noise: 0.7, buzz: 8 },
  kill: { from: 180, to: 45, decay: 0.22, type: 'sawtooth', gain: 0.8, noise: 0.5, buzz: 18 },
  // Coin chime: high, clean, no noise, so it cuts through a run of thuds.
  catch: { from: 1180, to: 1760, decay: 0.16, type: 'triangle', gain: 0.5, noise: 0, buzz: 12 },
  buy: { from: 520, to: 880, decay: 0.13, type: 'square', gain: 0.4, noise: 0, buzz: 10 },
  victory: { from: 240, to: 720, decay: 0.6, type: 'triangle', gain: 0.7, noise: 0.1, buzz: 60 },
};

export interface Feel {
  play(cue: Cue): void;
  /** Frames to freeze the scene for — the hit-stop that gives a swing weight. */
  hitStopSec(cue: Cue): number;
  setMuted(muted: boolean): void;
  muted(): boolean;
  dispose(): void;
}

/** Hit-stop per cue. A kill stops longer than a swing, which reads as heavier. */
const HIT_STOP: Record<Cue, number> = {
  strike: 0.035,
  kill: 0.075,
  catch: 0.02,
  buy: 0,
  victory: 0.12,
};

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic: a hash, not Math.random, so two runs sound identical and
  // nothing here can ever be mistaken for a source of game randomness.
  let h = 0x2f6e2b1;
  for (let i = 0; i < frames; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (h / 0x3fffffff - 1) * (1 - i / frames);
  }
  return buffer;
}

/**
 * Deterministic per-hit detune as a frequency multiplier. A counter hash, not
 * Math.random: two runs of the same session sound identical, and nothing here
 * can ever be mistaken for a source of game randomness.
 */
export function detuneFor(index: number): number {
  let h = (index + 1) * 0x9e3779b1;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  const unit = ((h >>> 0) / 0x100000000) * 2 - 1;
  return Math.pow(2, (unit * DETUNE_SEMITONES) / 12);
}

export function createFeel(options: FeelOptions = {}): Feel {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = options.muted ?? false;
  const canBuzz = options.haptics !== false && typeof navigator !== 'undefined' && 'vibrate' in navigator;
  const lastAt: Partial<Record<Cue, number>> = {};
  let hits = 0;

  /**
   * Built on the first cue, never at load: a context created before a user
   * gesture starts suspended, and browsers log a warning for it.
   */
  function ensure(): AudioContext | null {
    if (muted) return null;
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        ctx = new Ctor();
      } catch {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      noise = makeNoiseBuffer(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function play(cue: Cue): void {
    const voice = VOICES[cue];
    if (canBuzz && voice.buzz > 0) {
      try {
        navigator.vibrate(voice.buzz);
      } catch {
        /* a device that refuses to buzz is not an error worth surfacing */
      }
    }
    const audio = ensure();
    if (!audio || !master || !noise) return;

    const now = audio.currentTime;
    if (now - (lastAt[cue] ?? -1) < RETRIGGER_SEC) return;
    lastAt[cue] = now;

    const env = audio.createGain();
    env.gain.setValueAtTime(voice.gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + voice.decay);
    env.connect(master);

    const detune = detuneFor(hits++);
    const osc = audio.createOscillator();
    osc.type = voice.type;
    osc.frequency.setValueAtTime(voice.from * detune, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.to * detune), now + voice.decay);
    osc.connect(env);
    osc.start(now);
    osc.stop(now + voice.decay);

    if (voice.noise > 0) {
      const src = audio.createBufferSource();
      src.buffer = noise;
      const ng = audio.createGain();
      ng.gain.setValueAtTime(voice.gain * voice.noise, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + voice.decay * 0.6);
      src.connect(ng);
      ng.connect(master);
      src.start(now);
      src.stop(now + voice.decay);
    }
  }

  return {
    play,
    hitStopSec: (cue) => HIT_STOP[cue],
    setMuted: (next) => {
      muted = next;
      if (muted && ctx) void ctx.suspend();
    },
    muted: () => muted,
    dispose: () => {
      if (ctx) void ctx.close();
      ctx = null;
      master = null;
    },
  };
}
