/**
 * Optional global leaderboard backed by Supabase (free tier). Enabled when the build has
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Each browser signs in anonymously and may only
 * write its own row (row-level security); everyone can read.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TIME_CATEGORIES } from '@dc/shared';
import { localApi } from './server';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudEnabled = !!(URL && KEY);
let sb: SupabaseClient | null = null;
let ready: Promise<boolean> | null = null;
let last = '';

function client() {
  if (!cloudEnabled) return null;
  sb ??= createClient(URL!, KEY!, { auth: { persistSession: true, storageKey: 'dc.supabase' } });
  return sb;
}

async function signIn(): Promise<boolean> {
  const c = client();
  if (!c) return false;
  const { data } = await c.auth.getSession();
  if (data.session) return true;
  const { error } = await c.auth.signInAnonymously();
  if (error) console.warn('[cloud] anonymous sign-in failed (enable Anonymous sign-ins in Supabase Auth settings):', error.message);
  return !error;
}

/** Pushes this player's public stats when they change. */
export async function syncProfile() {
  if (!cloudEnabled) return;
  ready ??= signIn();
  if (!(await ready)) return;
  const me = await localApi('GET', '/api/me');
  if (me.status !== 200) return;
  const m = me.json.me;
  const prof = await localApi('GET', `/api/users/${encodeURIComponent(m.username)}`);
  const s = prof.json?.stats ?? {};
  const r = me.json.ratings;
  const clamp = (v: number) => Math.max(100, Math.min(3500, Math.round(v)));
  const row: Record<string, unknown> = {
    pid: m.id,
    username: m.username,
    icon: m.equipped.icon,
    card: m.equipped.card,
    level: Math.max(1, Math.min(100, m.level)),
    xp: Math.max(0, m.xp),
    rating: clamp(m.rating),
    games: s.games ?? 0,
    wins: s.wins ?? 0,
  };
  for (const c of TIME_CATEGORIES) {
    row[c] = clamp(r[c].rating);
    row[`${c}_games`] = r[c].games;
  }
  const json = JSON.stringify(row);
  if (json === last) return;
  const { error } = await client()!.from('players').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.warn('[cloud] sync failed:', error.message);
  else last = json;
}

export function startCloudSync() {
  if (!cloudEnabled) return;
  void syncProfile();
  setInterval(() => void syncProfile(), 20_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void syncProfile());
}

/** Global leaderboard in the same shape as /api/leaderboard. */
export async function cloudLeaderboard(type: string, myPid: string | null) {
  const c = client();
  if (!c) return null;
  const col = type === 'level' ? 'xp' : TIME_CATEGORIES.includes(type as never) ? type : 'rating';
  let q = c.from('players').select('*').order(col, { ascending: false }).limit(100);
  if (TIME_CATEGORIES.includes(type as never)) q = q.gt(`${type}_games`, 0);
  else if (type === 'overall' || type === 'season') q = q.gt('games', 0);
  const { data, error } = await q;
  if (error || !data) return null;
  const entries = data.map((p: any, i: number) => ({
    position: i + 1,
    id: p.pid,
    username: p.username,
    icon: p.icon,
    card: p.card,
    level: p.level,
    rating: type === 'level' ? p.rating : p[col],
    division: '',
    value: p[col],
  }));
  return { type, entries, myPosition: entries.find((e) => e.id === myPid)?.position ?? null, cloud: true };
}

/** Finds players by username prefix (includes offline players). */
export async function cloudSearch(term: string) {
  const c = client();
  if (!c || term.length < 2) return [];
  const { data } = await c.from('players').select('pid, username, icon, card, level, xp, rating').ilike('username', `${term.replace(/[%_]/g, '')}%`).limit(20);
  return data ?? [];
}
