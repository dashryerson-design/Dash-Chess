/** Browser replacement for server/src/engine/uci.ts: Stockfish WASM in Web Workers, same API. */
import type { EngineLine, Score } from '@dc/shared';

export interface SearchParams {
  fen: string;
  depth?: number;
  nodes?: number;
  movetime?: number;
  multipv?: number;
  searchmoves?: string[];
  fresh?: boolean;
}
export interface SearchResult {
  bestmove: string | null;
  lines: (EngineLine & { depth: number })[];
}

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`;

export class UciEngine {
  private w: Worker;
  private waiters: { test: (l: string) => boolean; resolve: (l: string) => void }[] = [];
  private onLine: ((l: string) => void) | null = null;
  private multipv = 1;
  ready: Promise<void>;
  dead = false;
  constructor(private label: string) {
    this.w = new Worker(ENGINE_URL);
    this.w.onmessage = (e) => this.line(String(e.data));
    this.w.onerror = () => (this.dead = true);
    this.ready = (async () => {
      this.send('uci');
      await this.wait((l) => l === 'uciok');
      this.send('setoption name Hash value 16');
      await this.isReady();
    })();
  }
  private line(l: string) {
    this.onLine?.(l);
    const i = this.waiters.findIndex((x) => x.test(l));
    if (i >= 0) this.waiters.splice(i, 1)[0].resolve(l);
  }
  private wait(test: (l: string) => boolean) {
    return new Promise<string>((resolve) => this.waiters.push({ test, resolve }));
  }
  send(c: string) {
    this.w.postMessage(c);
  }
  async isReady() {
    this.send('isready');
    await this.wait((l) => l === 'readyok');
  }
  async search(p: SearchParams): Promise<SearchResult> {
    await this.ready;
    const mpv = Math.max(1, p.multipv ?? 1);
    if (p.fresh) this.send('ucinewgame');
    if (mpv !== this.multipv) {
      this.send(`setoption name MultiPV value ${mpv}`);
      this.multipv = mpv;
    }
    await this.isReady();
    const lines = new Map<number, EngineLine & { depth: number }>();
    this.onLine = (l) => {
      if (!l.startsWith('info ') || !l.includes(' pv ')) return;
      const t = l.split(' ');
      let depth = 0, k = 1, bound = false, pv: string[] = [];
      let score: Score | null = null;
      for (let i = 1; i < t.length; i++) {
        const tok = t[i];
        if (tok === 'depth') depth = Number(t[++i]);
        else if (tok === 'multipv') k = Number(t[++i]);
        else if (tok === 'score') {
          const kind = t[++i];
          const v = Number(t[++i]);
          score = kind === 'mate' ? { mate: v } : { cp: v };
          if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') bound = true;
        } else if (tok === 'pv') {
          pv = t.slice(i + 1);
          break;
        }
      }
      if (!score || bound || !pv.length) return;
      lines.set(k, { move: pv[0], score, pv, depth });
    };
    this.send(`position fen ${p.fen}`);
    const parts = ['go'];
    if (p.depth) parts.push('depth', String(p.depth));
    if (p.nodes) parts.push('nodes', String(p.nodes));
    if (p.movetime) parts.push('movetime', String(p.movetime));
    if (p.searchmoves?.length) parts.push('searchmoves', ...p.searchmoves);
    this.send(parts.join(' '));
    const best = await this.wait((l) => l.startsWith('bestmove'));
    this.onLine = null;
    const bm = best.split(' ')[1];
    return { bestmove: bm && bm !== '(none)' ? bm : null, lines: [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]) };
  }
  kill() {
    this.dead = true;
    this.w.terminate();
  }
}

type Job<T> = { run: (e: UciEngine) => Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void; priority: number };
export class EnginePool {
  private idle: UciEngine[] = [];
  private queue: Job<any>[] = [];
  private all: UciEngine[] = [];
  constructor(private name: string, size: number) {
    for (let i = 0; i < size; i++) {
      const e = new UciEngine(`${name}-${i}`);
      this.all.push(e);
      this.idle.push(e);
    }
  }
  get pending() {
    return this.queue.length;
  }
  run<T>(fn: (e: UciEngine) => Promise<T>, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job = { run: fn, resolve, reject, priority };
      const i = this.queue.findIndex((j) => j.priority < priority);
      if (i === -1) this.queue.push(job);
      else this.queue.splice(i, 0, job);
      this.pump();
    });
  }
  private pump() {
    while (this.idle.length && this.queue.length) {
      const e = this.idle.pop()!;
      const job = this.queue.shift()!;
      job.run(e).then(job.resolve, job.reject).finally(() => {
        this.idle.push(e);
        this.pump();
      });
    }
  }
  close() {
    for (const e of this.all) e.kill();
  }
}
let bot: EnginePool | null = null;
let analysis: EnginePool | null = null;
export const getBotPool = () => (bot ??= new EnginePool('bot', 1));
export const getAnalysisPool = () => (analysis ??= new EnginePool('analysis', 1));
export function closePools() {
  bot?.close();
  analysis?.close();
  bot = analysis = null;
}
