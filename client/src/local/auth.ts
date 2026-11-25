/** Browser replacement for server/src/auth.ts. Accounts are local profiles: no passwords leave the device. */
import type { DB } from '../../../server/src/db';

const rand = (n: number) => {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const hashPassword = (_p: string) => 'local';
export const verifyPassword = (_p: string, _s: string) => true;
export function createSession(db: DB, userId: string, _ua?: string): string {
  const token = rand(24);
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)').run(token, userId, Date.now(), Date.now() + 3650 * 86400_000, 'browser');
  return token;
}
export function sessionUser(db: DB, token: string | undefined | null): string | null {
  if (!token) return null;
  const r = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get(token) as { user_id: string } | undefined;
  return r?.user_id ?? null;
}
export function destroySession(db: DB, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(token);
}
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export function validUsername(u: string): string | null {
  return USERNAME_RE.test(u) ? null : 'Usernames are 3-16 characters: letters, numbers and underscores.';
}
export const validPassword = (_p: string): string | null => null;
export const newId = (prefix = '') => prefix + rand(9);
export function cookieToken(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'dc_session') return decodeURIComponent(v.join('='));
  }
  return null;
}
