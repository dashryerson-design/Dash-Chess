/** Admin tools are unlocked per device by entering the admin passphrase (only its SHA-256 is stored here). */
const ADMIN_HASH = 'fbc8a95b96b871a1464a3fb23073b2c842601e8e8409a5ea1d0495ce95a4be64';
const KEY = 'dc.admin';

export function isAdmin(): boolean {
  try {
    return localStorage.getItem(KEY) === ADMIN_HASH;
  } catch {
    return false;
  }
}

export async function unlockAdmin(passphrase: string): Promise<boolean> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passphrase.trim()));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex !== ADMIN_HASH) return false;
  localStorage.setItem(KEY, hex);
  return true;
}

export function lockAdmin() {
  localStorage.removeItem(KEY);
}
