import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chess, type Square } from 'chess.js';
import { Puzzle, Lightbulb, SkipForward, Check, X, Calendar } from 'lucide-react';
import { api } from '../lib/api';
import { BoardView } from '../board/BoardView';
import { Empty, Loading } from '../components/ui';
import { moveSound, play } from '../lib/sound';
import { useElementSize } from '../lib/useSize';
import { useSettings } from '../stores/settings';
import { toastError } from '../stores/toasts';

interface P { id: string; fen: string; rating: number; themes: string[]; length: number }

export default function Puzzles() {
  const [params] = useSearchParams();
  const [puzzle, setPuzzle] = useState<P | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [fen, setFen] = useState('');
  const [moves, setMoves] = useState<string[]>([]);
  const [status, setStatus] = useState<'solving' | 'wrong' | 'solved' | 'failed'>('solving');
  const [outcome, setOutcome] = useState<{ ratingDelta: number; xp: number; first: boolean } | null>(null);
  const [hint, setHint] = useState<[Square, Square] | null>(null);
  const [solution, setSolution] = useState<string[] | null>(null);
  const [isDaily, setIsDaily] = useState(params.get('daily') === '1');
  const [empty, setEmpty] = useState(false);
  const mode3d = useSettings((s) => s.graphics.mode === '3d');
  const [boxRef, box] = useElementSize<HTMLDivElement>();

  const loadNext = useCallback(async (daily = false) => {
    setPuzzle(null);
    setStatus('solving');
    setOutcome(null);
    setHint(null);
    setSolution(null);
    setMoves([]);
    try {
      const r = daily ? await api.get('/api/puzzles/daily') : await api.get('/api/puzzles/next');
      if (!r.puzzle) return setEmpty(true);
      setPuzzle(r.puzzle);
      setFen(r.puzzle.fen);
      if (r.rating) setRating(r.rating);
      if (r.solved !== undefined) setSolvedCount(r.solved);
      setIsDaily(daily);
    } catch (e) {
      toastError(e);
    }
  }, []);

  useEffect(() => {
    void loadNext(params.get('daily') === '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (all: string[], solved: boolean) => {
    if (!puzzle) return;
    const r = await api.post(`/api/puzzles/${puzzle.id}/finish`, { moves: solved ? all : [] });
    setSolution(r.solution);
    setOutcome({ ratingDelta: r.ratingDelta, xp: r.xp, first: r.first });
    if (r.first) setRating((x) => (x ?? 1000) + r.ratingDelta);
    setStatus(solved ? 'solved' : 'failed');
    if (solved) {
      play('great');
      setSolvedCount((c) => c + (r.first ? 1 : 0));
    }
  };

  const onMove = (from: Square, to: Square, promo?: string) => {
    if (!puzzle || status !== 'solving') return false;
    const c = new Chess(fen);
    let m;
    try {
      m = c.move({ from, to, promotion: promo });
    } catch {
      return false;
    }
    const uci = from + to + (m.promotion ?? '');
    const next = [...moves, uci];
    moveSound(m.san);
    setFen(c.fen());
    setHint(null);
    void api.post(`/api/puzzles/${puzzle.id}/step`, { moves: next }).then(async (r) => {
      if (!r.correct) {
        play('blunder');
        setStatus('wrong');
        setTimeout(() => void finish(next, false), 600);
        return;
      }
      setMoves(next);
      if (r.done) return finish(next, true);
      if (r.reply) {
        setTimeout(() => {
          const c2 = new Chess(c.fen());
          const rm = c2.move({ from: r.reply.slice(0, 2), to: r.reply.slice(2, 4), promotion: r.reply[4] });
          moveSound(rm.san);
          setFen(c2.fen());
          setMoves([...next, r.reply]);
        }, 350);
      }
    });
    return true;
  };

  const showHint = async () => {
    if (!puzzle) return;
    // A hint reveals the solution, so the attempt is recorded as failed (keeps puzzle ratings honest).
    const r = await api.post(`/api/puzzles/${puzzle.id}/finish`, { moves: [] });
    setSolution(r.solution);
    setOutcome({ ratingDelta: r.ratingDelta, xp: 0, first: r.first });
    if (r.first) setRating((x) => (x ?? 1000) + r.ratingDelta);
    const nextMove = r.solution[moves.length];
    if (nextMove) setHint([nextMove.slice(0, 2), nextMove.slice(2, 4)] as [Square, Square]);
    setStatus('failed');
  };

  const playSolution = () => {
    if (!puzzle || !solution) return;
    const c = new Chess(puzzle.fen);
    setFen(c.fen());
    solution.forEach((u, i) =>
      setTimeout(() => {
        const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        moveSound(m.san);
        setFen(c.fen());
      }, 600 * (i + 1)),
    );
  };

  if (empty) return <div className="page"><Empty icon={<Puzzle />} title="No puzzles available">The puzzle set has not been generated on this server. Run <code>npm run puzzles</code>.</Empty></div>;
  if (!puzzle) return <Loading label="Loading puzzle…" />;
  const toMove = new Chess(puzzle.fen).turn();
  const size = mode3d ? null : Math.max(240, Math.min(box.width, box.height));
  const last = moves.length ? ([moves[moves.length - 1].slice(0, 2), moves[moves.length - 1].slice(2, 4)] as [Square, Square]) : null;

  return (
    <div className="game-layout">
      <div className="board-col">
        <div className="board-wrap" ref={boxRef} style={{ minHeight: mode3d ? 380 : undefined }}>
          <div style={{ width: size ?? '100%', height: size ?? '100%' }}>
            <BoardView fen={fen} orientation={toMove} movable={status === 'solving' ? toMove : null} onMove={onMove} lastMove={last} hint={hint} moveKey={moves.length} />
          </div>
        </div>
      </div>
      <div className="side-col">
        <div className="panel panel-pad col" style={{ gap: 12 }}>
          <div className="row between">
            <h3 className="panel-title">{isDaily ? <><Calendar /> Daily puzzle</> : <><Puzzle /> Puzzle</>}</h3>
            <span className="badge mono">Rated {puzzle.rating}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{toMove === 'w' ? 'White' : 'Black'} to move and win</div>
          <div className="row wrap" style={{ gap: 6 }}>{puzzle.themes.map((t) => <span key={t} className="badge">{t}</span>)}</div>
          {status === 'solving' && <div className="small muted">Find the best move. {puzzle.length > 1 ? `The solution is ${Math.ceil(puzzle.length / 2)} moves long.` : ''}</div>}
          {status === 'wrong' && <div className="row" style={{ color: 'var(--bad)', fontWeight: 700 }}><X /> Not the move.</div>}
          {status === 'solved' && <div className="row" style={{ color: 'var(--good)', fontWeight: 700 }}><Check /> Solved!</div>}
          {status === 'failed' && <div className="small" style={{ color: 'var(--warn)' }}>Puzzle failed. Review the solution and try the next one.</div>}
          {outcome && outcome.first && (
            <div className="small">
              Puzzle rating <span className={outcome.ratingDelta >= 0 ? 'win' : 'loss'}>{outcome.ratingDelta >= 0 ? '+' : ''}{outcome.ratingDelta}</span>
              {outcome.xp > 0 && <span style={{ color: 'var(--accent)' }}> · +{outcome.xp} XP</span>}
            </div>
          )}
          {outcome && !outcome.first && <div className="tiny muted">Already attempted: no rating change.</div>}
          <div className="row" style={{ gap: 8 }}>
            {status === 'solving' && <button className="btn" onClick={showHint}><Lightbulb /> Hint (counts as fail)</button>}
            {solution && <button className="btn" onClick={playSolution}>Show solution</button>}
            <button className="btn btn-primary" onClick={() => loadNext(false)}><SkipForward /> Next puzzle</button>
          </div>
        </div>
        <div className="panel panel-pad grid g2">
          <div className="stat"><span className="k">Puzzle rating</span><span className="v">{rating ?? '—'}</span></div>
          <div className="stat"><span className="k">Solved</span><span className="v">{solvedCount}</span></div>
        </div>
        <div className="tiny muted">Puzzles are generated from engine-verified positions where a single move wins decisively. Solutions are checked on the server; the first attempt at each puzzle counts.</div>
      </div>
    </div>
  );
}
