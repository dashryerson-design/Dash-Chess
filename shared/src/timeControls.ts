export type TimeCategory = 'bullet' | 'blitz' | 'rapid' | 'classical';
export const TIME_CATEGORIES: TimeCategory[] = ['bullet', 'blitz', 'rapid', 'classical'];

/** Time control in seconds. initial === 0 means untimed (only allowed for bot / local games). */
export interface TimeControl {
  initial: number;
  increment: number;
}

export interface TimePreset extends TimeControl {
  id: string;
  label: string;
  category: TimeCategory;
}

export const TIME_PRESETS: TimePreset[] = [
  { id: '1+0', label: '1 + 0', initial: 60, increment: 0, category: 'bullet' },
  { id: '1+1', label: '1 + 1', initial: 60, increment: 1, category: 'bullet' },
  { id: '3+0', label: '3 + 0', initial: 180, increment: 0, category: 'blitz' },
  { id: '3+2', label: '3 + 2', initial: 180, increment: 2, category: 'blitz' },
  { id: '5+0', label: '5 + 0', initial: 300, increment: 0, category: 'blitz' },
  { id: '5+3', label: '5 + 3', initial: 300, increment: 3, category: 'blitz' },
  { id: '10+0', label: '10 + 0', initial: 600, increment: 0, category: 'rapid' },
  { id: '10+5', label: '10 + 5', initial: 600, increment: 5, category: 'rapid' },
  { id: '15+10', label: '15 + 10', initial: 900, increment: 10, category: 'rapid' },
  { id: '30+0', label: '30 + 0', initial: 1800, increment: 0, category: 'classical' },
];

export const CATEGORY_LABEL: Record<TimeCategory, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
};

/** Estimated game duration (initial + 40 * increment), the same heuristic used by major platforms. */
export function categoryOf(tc: TimeControl): TimeCategory {
  if (tc.initial === 0) return 'classical';
  const est = tc.initial + 40 * tc.increment;
  if (est < 180) return 'bullet';
  if (est < 480) return 'blitz';
  if (est < 1500) return 'rapid';
  return 'classical';
}

export function presetById(id: string): TimePreset | undefined {
  return TIME_PRESETS.find((p) => p.id === id);
}

export function isPreset(tc: TimeControl): boolean {
  return TIME_PRESETS.some((p) => p.initial === tc.initial && p.increment === tc.increment);
}

export function tcLabel(tc: TimeControl): string {
  if (tc.initial === 0) return 'Untimed';
  const mins = tc.initial / 60;
  const m = Number.isInteger(mins) ? String(mins) : mins.toFixed(1).replace(/\.0$/, '');
  return `${m} + ${tc.increment}`;
}

/** Validates a custom time control: 15s..180min initial, 0..180s increment (or untimed if allowed). */
export function validTimeControl(tc: TimeControl, allowUntimed: boolean): boolean {
  if (!Number.isFinite(tc.initial) || !Number.isFinite(tc.increment)) return false;
  if (!Number.isInteger(tc.initial) || !Number.isInteger(tc.increment)) return false;
  if (tc.initial === 0) return allowUntimed && tc.increment === 0;
  return tc.initial >= 15 && tc.initial <= 10800 && tc.increment >= 0 && tc.increment <= 180;
}
