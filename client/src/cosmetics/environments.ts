export interface EnvironmentVisual {
  /** CSS background used behind the 2D board */
  css: string;
  three: {
    top: string;
    bottom: string;
    fog: string;
    fogDensity: number;
    floor: 'none' | 'grid' | 'wood' | 'sand' | 'stage' | 'stone';
    floorColor: string;
    key: string;
    keyIntensity: number;
    ambient: string;
    ambientIntensity: number;
    rim: string;
    particles: 'none' | 'stars' | 'dust' | 'embers';
    accent?: string;
  };
}

export const ENVIRONMENTS: Record<string, EnvironmentVisual> = {
  'background.void': {
    css: 'radial-gradient(900px 600px at 50% 40%, #151925 0%, #07080b 70%)',
    three: { top: '#151a26', bottom: '#050608', fog: '#07080b', fogDensity: 0.035, floor: 'stage', floorColor: '#0c0e13', key: '#ffffff', keyIntensity: 2.4, ambient: '#9fb0d0', ambientIntensity: 0.35, rim: '#6b7cff', particles: 'none' },
  },
  'background.study': {
    css: 'radial-gradient(800px 600px at 50% 30%, #3a2614 0%, #120a05 75%)',
    three: { top: '#2a1b0e', bottom: '#0d0804', fog: '#120a05', fogDensity: 0.04, floor: 'wood', floorColor: '#3b2414', key: '#ffd9a0', keyIntensity: 2.2, ambient: '#ffcf99', ambientIntensity: 0.3, rim: '#ff9e4a', particles: 'dust' },
  },
  'background.arena': {
    css: 'radial-gradient(700px 400px at 50% 0%, rgba(120,160,255,0.35), transparent 70%), radial-gradient(900px 600px at 50% 70%, #10151f 0%, #040508 75%)',
    three: { top: '#0b1220', bottom: '#020305', fog: '#05070c', fogDensity: 0.03, floor: 'stage', floorColor: '#0a0d14', key: '#dfe8ff', keyIntensity: 3, ambient: '#7d93c9', ambientIntensity: 0.25, rim: '#3d7bff', particles: 'dust', accent: '#3d7bff' },
  },
  'background.zen': {
    css: 'radial-gradient(900px 600px at 50% 30%, #2b3027 0%, #0e100c 75%)',
    three: { top: '#3a4134', bottom: '#11130f', fog: '#1a1d17', fogDensity: 0.035, floor: 'sand', floorColor: '#b8ae94', key: '#fff4e0', keyIntensity: 2.3, ambient: '#d9e2c8', ambientIntensity: 0.45, rim: '#cfe0b0', particles: 'none' },
  },
  'background.grid': {
    css: 'linear-gradient(180deg, #120624 0%, #2a0b3a 45%, #05020c 100%)',
    three: { top: '#1a0630', bottom: '#05010c', fog: '#12041f', fogDensity: 0.03, floor: 'grid', floorColor: '#ff3df2', key: '#ffd1f7', keyIntensity: 2.2, ambient: '#b56bff', ambientIntensity: 0.4, rim: '#3ff3ff', particles: 'none', accent: '#ff3df2' },
  },
  'background.nebula': {
    css: 'radial-gradient(600px 400px at 30% 30%, rgba(160,70,255,0.35), transparent 70%), radial-gradient(700px 500px at 75% 70%, rgba(40,120,255,0.3), transparent 70%), #04040a',
    three: { top: '#0d0620', bottom: '#020108', fog: '#05030f', fogDensity: 0.02, floor: 'none', floorColor: '#000', key: '#e5d9ff', keyIntensity: 2.5, ambient: '#8c7bff', ambientIntensity: 0.45, rim: '#ff5bd8', particles: 'stars' },
  },
  'background.throne': {
    css: 'radial-gradient(800px 500px at 50% 20%, rgba(255,200,90,0.22), transparent 70%), radial-gradient(900px 700px at 50% 60%, #1c1408 0%, #060402 80%)',
    three: { top: '#2a1d08', bottom: '#060402', fog: '#0d0904', fogDensity: 0.035, floor: 'stone', floorColor: '#2a2118', key: '#ffe2a8', keyIntensity: 2.6, ambient: '#ffcf7a', ambientIntensity: 0.3, rim: '#ffb22e', particles: 'embers', accent: '#ffb22e' },
  },
};

export function environmentVisual(id: string): EnvironmentVisual {
  return ENVIRONMENTS[id] ?? ENVIRONMENTS['background.void'];
}

/** Calling card backgrounds (CSS). */
export const CARDS: Record<string, string> = {
  'card.carbon':
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0 4px, transparent 4px 8px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.25) 0 4px, transparent 4px 8px), linear-gradient(135deg, #1d212a, #0c0e12)',
  'card.dawn': 'linear-gradient(120deg, #ff8a4c 0%, #ff4f7b 40%, #7b3dff 100%)',
  'card.circuit':
    'radial-gradient(circle at 20% 30%, rgba(38,217,255,0.5) 0 2px, transparent 3px), radial-gradient(circle at 70% 70%, rgba(38,217,255,0.5) 0 2px, transparent 3px), repeating-linear-gradient(90deg, rgba(38,217,255,0.12) 0 1px, transparent 1px 22px), repeating-linear-gradient(0deg, rgba(38,217,255,0.08) 0 1px, transparent 1px 22px), linear-gradient(135deg, #062030, #020a12)',
  'card.aurora':
    'radial-gradient(120% 80% at 10% 100%, rgba(40,255,170,0.55), transparent 60%), radial-gradient(90% 90% at 80% 0%, rgba(120,80,255,0.6), transparent 60%), radial-gradient(60% 60% at 60% 60%, rgba(0,200,255,0.35), transparent 70%), #050a14',
  'card.ember':
    'radial-gradient(circle at 80% 30%, rgba(255,200,80,0.6) 0 1.5px, transparent 2.5px), radial-gradient(circle at 60% 70%, rgba(255,150,60,0.6) 0 1px, transparent 2px), radial-gradient(120% 100% at 100% 100%, #ff5a1f 0%, #8a1a08 45%, #1a0603 100%)',
  'card.prism': 'conic-gradient(from 210deg at 70% 50%, #ff4f7b, #ffb22e, #3fcf8e, #3d7bff, #a55bff, #ff4f7b)',
  'card.galaxy':
    'radial-gradient(circle at 15% 25%, #fff 0 1px, transparent 1.5px), radial-gradient(circle at 45% 70%, #fff 0 1px, transparent 1.5px), radial-gradient(circle at 85% 20%, #fff 0 1px, transparent 1.5px), radial-gradient(ellipse at 65% 50%, rgba(255,120,220,0.55), transparent 45%), radial-gradient(ellipse at 55% 50%, rgba(90,110,255,0.6), transparent 65%), #05040d',
  'card.royal':
    'repeating-linear-gradient(45deg, rgba(255,207,90,0.16) 0 2px, transparent 2px 16px), repeating-linear-gradient(-45deg, rgba(255,207,90,0.16) 0 2px, transparent 2px 16px), linear-gradient(135deg, #3b0d6e, #1a0533 60%, #4d3008)',
  'card.veteran': 'repeating-linear-gradient(115deg, #3a2a18 0 18px, #4a3620 18px 36px), linear-gradient(#000,#000)',
  'card.streak': 'repeating-linear-gradient(120deg, rgba(255,120,40,0.85) 0 14px, rgba(255,60,40,0.85) 14px 28px, #2a0905 28px 42px)',
  'card.level50':
    'repeating-conic-gradient(from 0deg at 85% 50%, rgba(255,230,160,0.22) 0 6deg, transparent 6deg 14deg), radial-gradient(circle at 85% 50%, #ffd36a, #a86b00 30%, #1a1000 75%)',
  'card.ranked': 'repeating-linear-gradient(135deg, rgba(61,123,255,0.25) 0 10px, transparent 10px 20px), linear-gradient(90deg, #0a1736, #1d3a7a)',
  'card.season1':
    'radial-gradient(circle at 85% 50%, rgba(220,230,255,0.45), transparent 40%), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 10px), linear-gradient(135deg, #39414f, #12151b)',
};

export function cardCss(id: string): string {
  return CARDS[id] ?? CARDS['card.carbon'];
}

export const THEME_SWATCH: Record<string, [string, string]> = {
  'theme.electric': ['#3d7bff', '#8b5cff'],
  'theme.crimson': ['#ff3d5e', '#ff7a3d'],
  'theme.emerald': ['#19c98a', '#3db7ff'],
  'theme.solar': ['#ffae1a', '#ff6a3d'],
  'theme.elite': ['#d9dde6', '#7f8aa3'],
};
