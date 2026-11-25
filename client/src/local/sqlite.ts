/**
 * Minimal better-sqlite3-compatible wrapper over sql.js (SQLite compiled to WebAssembly).
 * The database lives in memory and is persisted to IndexedDB after writes.
 */
import initSqlJs, { type Database as SqlDb, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SQL: SqlJsStatic | null = null;
let preloaded: Uint8Array | null = null;
let saveTimer: number | null = null;
const IDB = 'dc-chess';
const KEY = 'db';

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(): Promise<Uint8Array | null> {
  try {
    const d = await idb();
    return await new Promise((res) => {
      const q = d.transaction('kv').objectStore('kv').get(KEY);
      q.onsuccess = () => res((q.result as Uint8Array) ?? null);
      q.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
async function idbPut(bytes: Uint8Array) {
  try {
    const d = await idb();
    d.transaction('kv', 'readwrite').objectStore('kv').put(bytes, KEY);
  } catch {
    /* storage unavailable: progress lives for this session only */
  }
}

export async function initSqlite() {
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
  preloaded = await idbGet();
}

type Param = string | number | null | bigint | boolean | undefined;
const norm = (ps: Param[]) => ps.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : typeof p === 'bigint' ? Number(p) : p));

export default class Database {
  private db: SqlDb;
  private depth = 0;
  private dirty = false;
  constructor(_file?: string) {
    if (!SQL) throw new Error('initSqlite() must be called first');
    this.db = preloaded ? new SQL.Database(preloaded) : new SQL.Database();
    preloaded = null;
  }
  private touch() {
    this.dirty = true;
    if (this.depth > 0) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => this.flush(), 120);
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    void idbPut(this.db.export());
  }
  pragma(s: string, opts?: { simple?: boolean }) {
    const res = this.db.exec(`PRAGMA ${s}`);
    if (opts?.simple) return res[0]?.values[0]?.[0];
    return res;
  }
  exec(sql: string) {
    this.db.exec(sql);
    this.touch();
  }
  prepare(sql: string) {
    const db = this.db;
    const self = this;
    const rows = (ps: Param[]) => {
      const st = db.prepare(sql);
      try {
        st.bind(norm(ps) as any);
        const out: any[] = [];
        while (st.step()) out.push(st.getAsObject());
        return out;
      } finally {
        st.free();
      }
    };
    return {
      get: (...ps: Param[]) => rows(ps)[0],
      all: (...ps: Param[]) => rows(ps),
      run: (...ps: Param[]) => {
        db.run(sql, norm(ps) as any);
        const changes = db.getRowsModified();
        const id = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0;
        self.touch();
        return { changes, lastInsertRowid: id as number };
      },
    };
  }
  transaction<A extends unknown[], R>(fn: (...a: A) => R) {
    return (...a: A): R => {
      const sp = `sp${this.depth}`;
      this.db.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      this.depth++;
      try {
        const r = fn(...a);
        this.depth--;
        this.db.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        this.touch();
        return r;
      } catch (e) {
        this.depth--;
        this.db.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    };
  }
  close() {
    this.flush();
  }
}
