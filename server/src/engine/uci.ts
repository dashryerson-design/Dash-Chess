import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import { config } from '../config';
import type { EngineLine, Score } from '@dc/shared';

export interface SearchParams {
  fen: string;
  depth?: number;
  nodes?: number;
  movetime?: number;
  multipv?: number;
  searchmoves?: string[];
  /** clear hash first so results are reproducible */
  fresh?: boolean;
}

export interface SearchResult {
  bestmove: string | null;
  lines: (EngineLine & { depth: number })[];
}

/** One Stockfish process speaking UCI over stdio. Native binary if configured, otherwise bundled WASM. */
export class UciEngine {
  private proc!: ChildProcessWithoutNullStreams;
  private buf = '';
  private waiters: { test: (l: string) => boolean; resolve: (l: string) => void }[] = [];
  private onLine: ((l: string) => void) | null = null;
  private multipv = 1;
  ready: Promise<void>;
  dead = false;

  constructor(private label: string) {
    this.ready = this.start();
  }

  private async start() {
    const native = config.stockfishPath && fs.existsSync(config.stockfishPath);
    this.proc = native
      ? spawn(config.stockfishPath, [], { stdio: 'pipe' })
      : spawn(process.execPath, [config.stockfishWasm], { stdio: 'pipe' });
    this.dead = false;
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d: string) => this.onData(d));
    this.proc.on('exit', () => {
      this.dead = true;
    });
    this.proc.stdin.on('error', () => {
      this.dead = true;
    });
    this.send('uci');
    await this.waitFor((l) => l === 'uciok');
    this.send('setoption name Threads value 1');
    this.send('setoption name Hash value 32');
    this.multipv = 1;
    await this.isReady();
  }

  private onData(d: string) {
    this.buf += d;
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      this.onLine?.(line);
      const w = this.waiters.findIndex((x) => x.test(line));
      if (w >= 0) {
        const [x] = this.waiters.splice(w, 1);
        x.resolve(line);
      }
    }
  }

  private waitFor(test: (l: string) => boolean): Promise<string> {
    return new Promise((resolve) => this.waiters.push({ test, resolve }));
  }

  send(cmd: string) {
    if (!this.dead) this.proc.stdin.write(cmd + '\n');
  }

  async isReady() {
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
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
      let depth = 0;
      let k = 1;
      let score: Score | null = null;
      let bound = false;
      let pv: string[] = [];
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
      if (!score || bound || pv.length === 0) return;
      lines.set(k, { move: pv[0], score, pv, depth });
    };
    this.send(`position fen ${p.fen}`);
    const parts = ['go'];
    if (p.depth) parts.push('depth', String(p.depth));
    if (p.nodes) parts.push('nodes', String(p.nodes));
    if (p.movetime) parts.push('movetime', String(p.movetime));
    if (p.searchmoves?.length) parts.push('searchmoves', ...p.searchmoves);
    this.send(parts.join(' '));
    const limit = (p.movetime ?? 0) + 90_000;
    let timer: NodeJS.Timeout | undefined;
    const best = await Promise.race([
      this.waitFor((l) => l.startsWith('bestmove')),
      new Promise<string>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`engine ${this.label} timed out`)), limit);
      }),
    ]).catch((err) => {
      this.onLine = null;
      this.kill();
      throw err;
    });
    clearTimeout(timer);
    this.onLine = null;
    const bm = best.split(' ')[1];
    const sorted = [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    return { bestmove: bm && bm !== '(none)' ? bm : null, lines: sorted };
  }

  kill() {
    this.dead = true;
    try {
      this.send('quit');
      this.proc.kill();
    } catch {
      /* ignore */
    }
  }
}

type Job<T> = { run: (e: UciEngine) => Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void; priority: number };

/** Fixed-size pool of engines with a priority queue (higher priority first). */
export class EnginePool {
  private engines: UciEngine[] = [];
  private idle: UciEngine[] = [];
  private queue: Job<any>[] = [];

  constructor(private name: string, size: number) {
    for (let i = 0; i < size; i++) {
      const e = new UciEngine(`${name}-${i}`);
      this.engines.push(e);
      this.idle.push(e);
    }
  }

  get pending() {
    return this.queue.length;
  }

  run<T>(fn: (e: UciEngine) => Promise<T>, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job<T> = { run: fn, resolve, reject, priority };
      const idx = this.queue.findIndex((j) => j.priority < priority);
      if (idx === -1) this.queue.push(job);
      else this.queue.splice(idx, 0, job);
      this.pump();
    });
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      let e = this.idle.pop()!;
      if (e.dead) {
        const i = this.engines.indexOf(e);
        e = new UciEngine(`${this.name}-r`);
        this.engines[i] = e;
      }
      const job = this.queue.shift()!;
      const engine = e;
      job
        .run(engine)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.idle.push(engine);
          this.pump();
        });
    }
  }

  close() {
    for (const e of this.engines) e.kill();
  }
}

let botPool: EnginePool | null = null;
let analysisPool: EnginePool | null = null;
export const getBotPool = () => (botPool ??= new EnginePool('bot', config.botEngines));
export const getAnalysisPool = () => (analysisPool ??= new EnginePool('analysis', config.analysisEngines));
export function closePools() {
  botPool?.close();
  analysisPool?.close();
  botPool = analysisPool = null;
}
