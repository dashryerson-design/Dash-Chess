/**
 * Procedural sound engine (Web Audio). No audio files are shipped: every sound pack is a set of
 * synthesis recipes, so packs are tiny and instantly available.
 */
export type SoundEvent =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promote'
  | 'start'
  | 'win'
  | 'lose'
  | 'draw'
  | 'notify'
  | 'lowtime'
  | 'illegal'
  | 'click'
  | 'great'
  | 'incredible'
  | 'blunder'
  | 'levelup';

export interface Volumes {
  master: number;
  sfx: number;
  music: number;
  moveSounds: boolean;
  captureSounds: boolean;
  notificationSounds: boolean;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let pack = 'sound.standard';
let vols: Volumes = { master: 0.8, sfx: 0.8, music: 0, moveSounds: true, captureSounds: true, notificationSounds: true };
let noiseBuf: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(ctx.destination);
    applyVolumes();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function applyVolumes() {
  if (!master || !sfxBus || !musicBus) return;
  master.gain.value = vols.master;
  sfxBus.gain.value = vols.sfx;
  musicBus.gain.value = vols.music * 0.35;
}

export function configureSound(v: Partial<Volumes>, soundPack?: string) {
  vols = { ...vols, ...v };
  if (soundPack) pack = soundPack;
  applyVolumes();
  if (vols.music > 0 && ctx) startMusic();
  if (vols.music === 0) stopMusic();
}

/** Must be called from a user gesture once to unlock audio on mobile. */
export function unlockAudio() {
  ensure();
  if (vols.music > 0) startMusic();
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, dur: number, type: OscillatorType, peak: number, when = 0, slideTo?: number) {
  const c = ensure();
  if (!c || !sfxBus) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.004, peak, dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, filterFreq: number, q: number, peak: number, when = 0, type: BiquadFilterType = 'bandpass') {
  const c = ensure();
  if (!c || !sfxBus || !noiseBuf) return;
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, 0.002, peak, dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

type Recipe = Partial<Record<SoundEvent, () => void>>;

const chord = (notes: number[], type: OscillatorType, peak: number, step = 0.07, dur = 0.35) => notes.forEach((n, i) => tone(n, dur, type, peak, i * step));

const shared: Recipe = {
  notify: () => chord([880, 1320], 'sine', 0.12, 0.09, 0.25),
  lowtime: () => tone(1000, 0.08, 'square', 0.05),
  win: () => chord([523, 659, 784, 1047], 'triangle', 0.16, 0.09, 0.5),
  lose: () => chord([392, 330, 262], 'triangle', 0.14, 0.12, 0.5),
  draw: () => chord([440, 440 * 1.25], 'triangle', 0.12, 0.1, 0.45),
  start: () => chord([392, 523, 659], 'sine', 0.13, 0.06, 0.35),
  great: () => chord([784, 1175], 'sine', 0.08, 0.06, 0.3),
  incredible: () => {
    chord([659, 880, 1109, 1319, 1760], 'sine', 0.09, 0.05, 0.55);
    noise(0.6, 6000, 0.7, 0.03, 0.05, 'highpass');
  },
  blunder: () => tone(220, 0.35, 'sawtooth', 0.04, 0, 110),
  levelup: () => chord([523, 659, 784, 1047, 1319], 'triangle', 0.14, 0.08, 0.6),
  illegal: () => tone(160, 0.12, 'square', 0.05),
  click: () => tone(1800, 0.025, 'sine', 0.04),
};

const PACKS: Record<string, Recipe> = {
  'sound.standard': {
    ...shared,
    move: () => {
      noise(0.05, 1900, 1.2, 0.5);
      tone(170, 0.06, 'sine', 0.25);
    },
    capture: () => {
      noise(0.09, 1300, 0.9, 0.65);
      tone(120, 0.1, 'sine', 0.35);
    },
    castle: () => {
      noise(0.05, 1900, 1.2, 0.45);
      noise(0.05, 1700, 1.2, 0.45, 0.09);
    },
    check: () => {
      noise(0.06, 2200, 1.4, 0.5);
      tone(880, 0.14, 'triangle', 0.1, 0.02);
    },
    promote: () => chord([660, 990], 'triangle', 0.12, 0.06, 0.25),
  },
  'sound.wood': {
    ...shared,
    move: () => {
      tone(620, 0.07, 'sine', 0.3, 0, 480);
      noise(0.04, 900, 3, 0.4);
    },
    capture: () => {
      tone(420, 0.11, 'sine', 0.35, 0, 300);
      noise(0.08, 700, 2, 0.55);
    },
    castle: () => {
      tone(620, 0.06, 'sine', 0.3, 0, 480);
      tone(560, 0.06, 'sine', 0.3, 0.1, 440);
    },
    check: () => {
      tone(700, 0.08, 'sine', 0.3, 0, 520);
      tone(1050, 0.16, 'triangle', 0.08, 0.04);
    },
    promote: () => chord([520, 780], 'sine', 0.14, 0.07, 0.3),
  },
  'sound.digital': {
    ...shared,
    move: () => tone(1240, 0.05, 'sine', 0.16, 0, 980),
    capture: () => {
      tone(820, 0.09, 'sine', 0.2, 0, 420);
      tone(1640, 0.05, 'sine', 0.08, 0.02);
    },
    castle: () => {
      tone(1240, 0.04, 'sine', 0.15);
      tone(1480, 0.04, 'sine', 0.15, 0.07);
    },
    check: () => chord([1320, 1760], 'sine', 0.12, 0.05, 0.16),
    promote: () => chord([990, 1320, 1760], 'sine', 0.1, 0.05, 0.2),
  },
  'sound.arcade': {
    ...shared,
    move: () => tone(660, 0.05, 'square', 0.07, 0, 880),
    capture: () => {
      tone(440, 0.1, 'square', 0.08, 0, 110);
      noise(0.08, 3000, 0.5, 0.12);
    },
    castle: () => chord([523, 659], 'square', 0.07, 0.06, 0.06),
    check: () => chord([988, 1319], 'square', 0.07, 0.05, 0.08),
    promote: () => chord([523, 659, 784, 1047], 'square', 0.06, 0.04, 0.08),
    win: () => chord([523, 659, 784, 1047, 1319], 'square', 0.07, 0.08, 0.15),
  },
  'sound.soft': {
    ...shared,
    move: () => noise(0.05, 700, 0.8, 0.28, 0, 'lowpass'),
    capture: () => {
      noise(0.08, 500, 0.8, 0.4, 0, 'lowpass');
      tone(140, 0.08, 'sine', 0.15);
    },
    castle: () => {
      noise(0.05, 700, 0.8, 0.25, 0, 'lowpass');
      noise(0.05, 700, 0.8, 0.25, 0.09, 'lowpass');
    },
    check: () => tone(520, 0.18, 'sine', 0.08),
    promote: () => chord([440, 660], 'sine', 0.08, 0.07, 0.3),
  },
};

export function play(ev: SoundEvent, overridePack?: string) {
  if (vols.master <= 0 || vols.sfx <= 0) return;
  if (ev === 'move' || ev === 'castle' || ev === 'promote') if (!vols.moveSounds) return;
  if (ev === 'capture' && !vols.captureSounds) return;
  if (ev === 'notify' && !vols.notificationSounds) return;
  const recipe = PACKS[overridePack ?? pack] ?? PACKS['sound.standard'];
  try {
    (recipe[ev] ?? PACKS['sound.standard'][ev])?.();
  } catch {
    /* audio unavailable */
  }
}

// ------------------------------------------------------------------ ambient music (generative pad)
let musicTimer: number | null = null;
const PROG = [
  [220, 261.6, 329.6],
  [174.6, 220, 261.6],
  [196, 246.9, 293.7],
  [164.8, 207.7, 246.9],
];
function startMusic() {
  const c = ensure();
  if (!c || !musicBus || musicTimer !== null) return;
  let i = 0;
  const playChord = () => {
    const t = c.currentTime;
    for (const f of PROG[i % PROG.length]) {
      for (const det of [-4, 4]) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = det;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 2.5);
        g.gain.linearRampToValueAtTime(0.0001, t + 7.5);
        o.connect(g).connect(musicBus!);
        o.start(t);
        o.stop(t + 8);
      }
    }
    i++;
  };
  playChord();
  musicTimer = window.setInterval(playChord, 6000);
}
function stopMusic() {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
}

export function moveSound(san: string) {
  if (san.includes('#')) return play('check');
  if (san.includes('+')) return play('check');
  if (san.startsWith('O-O')) return play('castle');
  if (san.includes('=')) return play('promote');
  if (san.includes('x')) return play('capture');
  play('move');
}
