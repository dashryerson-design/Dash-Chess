/**
 * DC Rating divisions. Fully data-driven: edit DIVISION_CONFIG to change tiers/thresholds.
 * Tiers with `subdivisions: 3` are split evenly into III (lowest) -> II -> I (highest).
 */
export interface DivisionTier {
  id: string;
  name: string;
  min: number;
  max: number; // inclusive upper bound; Infinity for the top tier
  subdivisions: 1 | 3;
  color: string;
  glow: string;
}

export const DIVISION_CONFIG: DivisionTier[] = [
  { id: 'bronze', name: 'Bronze', min: 0, max: 799, subdivisions: 3, color: '#c27a4a', glow: '#ff9a5c' },
  { id: 'silver', name: 'Silver', min: 800, max: 1099, subdivisions: 3, color: '#a9b4c2', glow: '#dce6f2' },
  { id: 'gold', name: 'Gold', min: 1100, max: 1399, subdivisions: 3, color: '#e0b43c', glow: '#ffd76a' },
  { id: 'platinum', name: 'Platinum', min: 1400, max: 1699, subdivisions: 3, color: '#3ec7c0', glow: '#7af5ec' },
  { id: 'diamond', name: 'Diamond', min: 1700, max: 1999, subdivisions: 3, color: '#5b8cff', glow: '#9cc0ff' },
  { id: 'master', name: 'Master', min: 2000, max: 2199, subdivisions: 1, color: '#a35bff', glow: '#cf9dff' },
  { id: 'grandmaster', name: 'Grandmaster', min: 2200, max: 2399, subdivisions: 1, color: '#ff4f7b', glow: '#ff9ab3' },
  { id: 'elite', name: 'DC Elite', min: 2400, max: Infinity, subdivisions: 1, color: '#ffffff', glow: '#7f5bff' },
];

export interface DivisionInfo {
  tier: DivisionTier;
  sub: 'I' | 'II' | 'III' | null;
  name: string;
  /** progress 0..1 within the current (sub)division; 1 for the top tier */
  progress: number;
  nextName: string | null;
  nextAt: number | null;
  index: number; // ordinal rank across all (sub)divisions, used for achievements
}

const SUBS = ['III', 'II', 'I'] as const;

export function divisionFor(ratingIn: number): DivisionInfo {
  const rating = Math.max(0, Math.round(ratingIn));
  let index = 0;
  for (let t = 0; t < DIVISION_CONFIG.length; t++) {
    const tier = DIVISION_CONFIG[t];
    if (rating > tier.max && t < DIVISION_CONFIG.length - 1) {
      index += tier.subdivisions;
      continue;
    }
    if (tier.subdivisions === 1) {
      const next = DIVISION_CONFIG[t + 1];
      const span = Number.isFinite(tier.max) ? tier.max + 1 - tier.min : 1;
      return {
        tier,
        sub: null,
        name: tier.name,
        progress: Number.isFinite(tier.max) ? Math.min(1, (rating - tier.min) / span) : 1,
        nextName: next ? labelFor(next, 0) : null,
        nextAt: next ? next.min : null,
        index,
      };
    }
    const span = (tier.max + 1 - tier.min) / 3;
    const s = Math.min(2, Math.floor((rating - tier.min) / span));
    const lo = tier.min + s * span;
    const nextTier = DIVISION_CONFIG[t + 1];
    const nextAt = s < 2 ? Math.round(tier.min + (s + 1) * span) : nextTier ? nextTier.min : null;
    const nextName = s < 2 ? `${tier.name} ${SUBS[s + 1]}` : nextTier ? labelFor(nextTier, 0) : null;
    return {
      tier,
      sub: SUBS[s],
      name: `${tier.name} ${SUBS[s]}`,
      progress: Math.min(1, Math.max(0, (rating - lo) / span)),
      nextName,
      nextAt,
      index: index + s,
    };
  }
  const tier = DIVISION_CONFIG[DIVISION_CONFIG.length - 1];
  return { tier, sub: null, name: tier.name, progress: 1, nextName: null, nextAt: null, index };
}

function labelFor(tier: DivisionTier, s: number): string {
  return tier.subdivisions === 3 ? `${tier.name} ${SUBS[s]}` : tier.name;
}

export function tierIdFor(rating: number): string {
  return divisionFor(rating).tier.id;
}
