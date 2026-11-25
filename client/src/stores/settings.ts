import { create } from 'zustand';
import { detectDevice, recommendedGraphics } from '../lib/device';
import { configureSound } from '../lib/sound';

export type Quality = 'low' | 'medium' | 'high';
export interface Settings {
  graphics: {
    mode: '2d' | '3d';
    quality: Quality;
    shadows: boolean;
    lighting: 'studio' | 'dramatic' | 'soft';
    effects: boolean;
    animations: 'full' | 'reduced' | 'off';
    animationSpeed: number;
    cameraSensitivity: number;
    cinematic: boolean;
    reflections: boolean;
  };
  gameplay: {
    legalMoves: boolean;
    legalStyle: 'dots' | 'rings' | 'squares';
    coordinates: 'inside' | 'off';
    highlightLastMove: boolean;
    highlightColor: 'gold' | 'blue' | 'green' | 'purple' | 'red';
    premoves: boolean;
    autoQueen: boolean;
    confirmResign: boolean;
    orientation: 'auto' | 'white' | 'black';
    liveRatings: boolean;
    moveInput: 'both' | 'click' | 'drag';
    captureAnimation: boolean;
    checkEffect: boolean;
    moveEffects: boolean;
  };
  audio: { master: number; sfx: number; music: number; moveSounds: boolean; captureSounds: boolean; notificationSounds: boolean };
  ui: { scale: number; reduceMotion: boolean; toasts: boolean; friendAlerts: boolean; challengeAlerts: boolean };
}

const device = typeof window !== 'undefined' ? detectDevice() : null;
const rec = device ? recommendedGraphics(device) : { mode: '2d' as const, quality: 'medium' as const, shadows: false };

export const DEFAULT_SETTINGS: Settings = {
  graphics: {
    mode: rec.mode,
    quality: rec.quality,
    shadows: rec.shadows,
    lighting: 'studio',
    effects: true,
    animations: 'full',
    animationSpeed: 1,
    cameraSensitivity: 1,
    cinematic: false,
    reflections: rec.quality === 'high',
  },
  gameplay: {
    legalMoves: true,
    legalStyle: 'dots',
    coordinates: 'inside',
    highlightLastMove: true,
    highlightColor: 'gold',
    premoves: true,
    autoQueen: false,
    confirmResign: true,
    orientation: 'auto',
    liveRatings: true,
    moveInput: 'both',
    captureAnimation: true,
    checkEffect: true,
    moveEffects: true,
  },
  audio: { master: 0.8, sfx: 0.8, music: 0, moveSounds: true, captureSounds: true, notificationSounds: true },
  ui: { scale: 1, reduceMotion: false, toasts: true, friendAlerts: true, challengeAlerts: true },
};

const KEY = 'dc.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw);
    return {
      graphics: { ...DEFAULT_SETTINGS.graphics, ...s.graphics },
      gameplay: { ...DEFAULT_SETTINGS.gameplay, ...s.gameplay },
      audio: { ...DEFAULT_SETTINGS.audio, ...s.audio },
      ui: { ...DEFAULT_SETTINGS.ui, ...s.ui },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type Section = keyof Settings;
interface SettingsStore extends Settings {
  set: <K extends Section>(section: K, patch: Partial<Settings[K]>) => void;
  replace: (s: Partial<Settings>) => void;
  reset: () => void;
}

let syncTimer: number | null = null;
let syncFn: ((s: Settings) => void) | null = null;
export function onSettingsSync(fn: (s: Settings) => void) {
  syncFn = fn;
}

function persist(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
  applyDom(s);
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => syncFn?.(s), 800);
}

export function applyDom(s: Settings) {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(s.ui.scale));
  const reduce = s.ui.reduceMotion || s.graphics.animations === 'off';
  root.dataset.reduceMotion = String(reduce);
  root.style.setProperty('--anim', String(reduce ? 0.01 : 1 / s.graphics.animationSpeed));
  configureSound(s.audio);
}

const pick = (st: SettingsStore): Settings => ({ graphics: st.graphics, gameplay: st.gameplay, audio: st.audio, ui: st.ui });

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (section, patch) => {
    set({ [section]: { ...get()[section], ...patch } } as Partial<SettingsStore>);
    persist(pick(get()));
  },
  replace: (s) => {
    set({
      graphics: { ...get().graphics, ...s.graphics },
      gameplay: { ...get().gameplay, ...s.gameplay },
      audio: { ...get().audio, ...s.audio },
      ui: { ...get().ui, ...s.ui },
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(pick(get())));
    } catch {
      /* ignore */
    }
    applyDom(pick(get()));
  },
  reset: () => {
    set(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
  },
}));

export const getSettings = () => pick(useSettings.getState());
export const recommended = () => (device ? { ...recommendedGraphics(device), device } : null);
