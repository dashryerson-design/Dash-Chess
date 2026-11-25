/**
 * Browser Stockfish (WASM lite, single-threaded) in a Web Worker. Used for the analysis board,
 * exploration lines in replays and training drills. Never blocks the main thread.
 * Competitive results never depend on this engine: rewards are computed on the server.
 */
export interface EngineLine {
  multipv: number;
  depth: number;
  cp: number | null;
  mate: number | null;
  pv: string[];
}

type Listener = (lines: EngineLine[], done: boolean, best: string | null) => void;

class ClientEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private listener: Listener | null = null;
  private lines = new Map<number, EngineLine>();
  private searching = false;
  private pending: (() => void) | null = null;
  private onBest: ((b: string | null) => void) | null = null;
  failed = false;

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`);
      } catch (e) {
        this.failed = true;
        reject(e);
        return;
      }
      const timeout = setTimeout(() => {
        this.failed = true;
        reject(new Error('Engine failed to load'));
      }, 20000);
      this.worker.onerror = () => {
        this.failed = true;
        clearTimeout(timeout);
        reject(new Error('Engine failed to load'));
      };
      this.worker.onmessage = (e: MessageEvent) => {
        const line = String(e.data);
        if (line === 'uciok') {
          this.worker!.postMessage('setoption name Hash value 16');
          this.worker!.postMessage('isready');
        } else if (line === 'readyok' && timeout) {
          clearTimeout(timeout);
          resolve();
        }
        this.handle(line);
      };
      this.worker.postMessage('uci');
    });
    return this.ready;
  }

  private handle(line: string) {
    if (line.startsWith('info ') && line.includes(' pv ')) {
      const t = line.split(' ');
      const get = (k: string) => {
        const i = t.indexOf(k);
        return i >= 0 ? t[i + 1] : undefined;
      };
      if (t.includes('lowerbound') || t.includes('upperbound')) return;
      const mpv = Number(get('multipv') ?? 1);
      const kind = get('score');
      const si = t.indexOf('score');
      const val = Number(t[si + 2]);
      const pv = t.slice(t.indexOf('pv') + 1);
      this.lines.set(mpv, { multipv: mpv, depth: Number(get('depth')), cp: kind === 'cp' ? val : null, mate: kind === 'mate' ? val : null, pv });
      this.listener?.([...this.lines.values()].sort((a, b) => a.multipv - b.multipv), false, null);
    } else if (line.startsWith('bestmove')) {
      this.searching = false;
      const best = line.split(' ')[1] ?? null;
      this.listener?.([...this.lines.values()].sort((a, b) => a.multipv - b.multipv), true, best);
      this.onBest?.(best === '(none)' ? null : best);
      this.onBest = null;
      const p = this.pending;
      this.pending = null;
      p?.();
    }
  }

  /** Analyse a position; previous search is stopped. Scores are from the side to move. */
  async analyse(fen: string, opts: { depth?: number; multipv?: number; movetime?: number; skill?: number }, listener: Listener) {
    await this.start();
    const go = () => {
      this.lines.clear();
      this.listener = listener;
      this.searching = true;
      this.worker!.postMessage(`setoption name MultiPV value ${opts.multipv ?? 1}`);
      this.worker!.postMessage(`setoption name Skill Level value ${opts.skill ?? 20}`);
      this.worker!.postMessage(`position fen ${fen}`);
      this.worker!.postMessage(`go ${opts.movetime ? `movetime ${opts.movetime}` : `depth ${opts.depth ?? 16}`}`);
    };
    if (this.searching) {
      this.pending = go;
      this.listener = null;
      this.worker!.postMessage('stop');
    } else go();
  }

  /** Best move with optional skill limit (training opponent). */
  bestMove(fen: string, opts: { movetime?: number; depth?: number; skill?: number }): Promise<string | null> {
    return new Promise((resolve) => {
      void this.analyse(fen, { ...opts, multipv: 1 }, () => {}).then(() => {
        this.onBest = resolve;
      }).catch(() => resolve(null));
    });
  }

  stop() {
    if (this.searching) this.worker?.postMessage('stop');
    this.listener = null;
  }
}

export const engine = new ClientEngine();

export function lineEvalWhite(l: EngineLine | undefined, fen: string): number | null {
  if (!l) return null;
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  if (l.mate !== null) return sign * (l.mate > 0 ? 10000 - l.mate * 10 : -10000 - l.mate * 10);
  return l.cp === null ? null : sign * l.cp;
}
