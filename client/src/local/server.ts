/** Boots the full DC Chess server inside the page (database, engine, game rooms, routes). */
import { initSqlite } from './sqlite';
import { registerFile } from './fs';
import { MiniApp, getCookie } from './router';
import { localSocket, type Server, type ClientSocket } from './io';
import { openDb, type DB } from '../../../server/src/db';
import { setAnalysisDb } from '../../../server/src/engine/analyzer';
import { loadOpenings } from '../../../server/src/openings';
import { createRealtime, type Realtime } from '../../../server/src/realtime';
import { registerRoutes } from '../../../server/src/routes';

export let localDb: DB;
export let localRt: Realtime;
let app: MiniApp;

export async function bootLocalServer() {
  const base = import.meta.env.BASE_URL;
  const fetchText = (f: string) => fetch(`${base}data/${f}`).then((r) => (r.ok ? r.text() : ''));
  const [, ...texts] = await Promise.all([initSqlite(), ...['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv', 'puzzles.json'].map(fetchText)]);
  ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv', 'puzzles.json'].forEach((f, i) => texts[i] && registerFile(`/data/${f}`, texts[i] as string));
  localDb = openDb('local');
  setAnalysisDb(localDb);
  loadOpenings();
  localRt = createRealtime(null as any, localDb);
  app = new MiniApp();
  registerRoutes(app as any, localDb, localRt);
  void localRt.games.resumePending();
  const flush = () => (localDb as any).flush?.();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

export function localApi(method: string, url: string, body?: unknown) {
  return app.inject(method, url, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
}

export function newLocalSocket(): ClientSocket {
  return localSocket(localRt.io as unknown as Server, () => `dc_session=${encodeURIComponent(getCookie())}`);
}
