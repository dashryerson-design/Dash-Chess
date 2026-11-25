import crypto from 'node:crypto';
import type { DB } from './db';
import { config } from './config';

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'base64');
  const expected = Buffer.from(parts[3], 'base64');
  const actual = crypto.scryptSync(password, salt, expected.length, { N, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(db: DB, userId: string, userAgent: string | undefined): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)').run(
    sha256(token),
    userId,
    t,
    t + config.sessionDays * 86400_000,
    (userAgent ?? '').slice(0, 200),
  );
  return token;
}

export function sessionUser(db: DB, token: string | undefined | null): string | null {
  if (!token || token.length > 200) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token)) as
    | { user_id: string; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return null;
  }
  return row.user_id;
}

export function destroySession(db: DB, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const RESERVED = new Set(['admin', 'system', 'moderator', 'dcchess', 'dc_chess', 'anonymous', 'guest', ...['rookie', 'champion']]);
export function validUsername(u: string): string | null {
  if (!USERNAME_RE.test(u)) return 'Usernames are 3-16 characters: letters, numbers and underscores.';
  if (RESERVED.has(u.toLowerCase())) return 'That username is reserved.';
  return null;
}
export function validPassword(p: string): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'Passwords must be at least 8 characters.';
  if (p.length > 128) return 'Password is too long.';
  return null;
}

export function newId(prefix = ''): string {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

export function cookieToken(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'dc_session') return decodeURIComponent(v.join('='));
  }
  return null;
}
