import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Chess, type Square } from 'chess.js';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCw, Share2, Cpu, BookOpen, Sparkles, Undo2, Search } from 'lucide-react';
import { CLASS_META, END_REASON_LABEL, countClasses, tcLabel, winProb, type MoveRating, type EndReason } from '@dc/shared';
import { api } from '../lib/api';
import { BoardView } from '../board/BoardView';
import { MoveList, fenAt } from '../components/GameParts';
import { ClassBars, ClassDot, Empty, Loading, Spinner } from '../components/ui';
import { PlayerIcon } from '../cosmetics/icons';
import { engine, lineEvalWhite, type EngineLine } from '../engine/clientEngine';
import { fmtDate, fmtEval } from '../lib/format';
import { toast } from '../stores/toasts';
import { useElementSize } from '../lib/useSize';
import { useSettings } from '../stores/settings';
import { useSession } from '../stores/session';
import type { Marker } from '../board/types';

interface GameRecord {
  id: string;
  mode: string;
  rated: number;
  white_name: string;
  black_name: string;
  white_id: string | null;
  black_id: string | null;
  white_rating: number | null;
  black_rating: number | null;
  white_delta: number | null;
  black_delta: number | null;
  result: string;
  reason: EndReason;
  tc_initial: number;
  tc_increment: number;
  opening_name: string | null;
  opening_eco: string | null;
  moves: { uci: string; san: string; clock: number | null; spent: number }[];
  analysis: { ratings: MoveRating[]; accuracy: { w: number; b: number } } | null;
  ended_at: number;
  pgn: string;
}

function EvalGraph({ ratings, cursor, onSelect }: { ratings: MoveRating[]; cursor: number; onSelect: (p: number) => void }) {
  if (!ratings.length) return null;
  const W = 600;
  const H = 90;
  const pts = [0.5, ...ratings.map((r) => winProb({ cp: r.evalPlayed }))];
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - v * H;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 90, display: 'block', cursor: 'pointer', borderRadius: 6, background: '#22252c' }}
      onClick={(e) => {
        const r = (e.currentTarget as SVGElement).getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1));
        onSelect(Math.max(-1, Math.min(ratings.length - 1, i - 1)));
      }}>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="#e9ebef" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#888" strokeDasharray="4 4" opacity={0.6} />
      {ratings.map((r, i) =>
        ['incredible', 'great', 'blunder', 'bad'].includes(r.cls) ? <circle key={i} cx={x(i + 1)} cy={y(pts[i + 1])} r={3.5} fill={CLASS_META[r.cls].color} stroke="#000" strokeWidth={0.8} /> : null,
      )}
      <line x1={x(cursor + 1)} x2={x(cursor + 1)} y1={0} y2={H} stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function EvalBar({ cp, orientation }: { cp: number | null; orientation: 'w' | 'b' }) {
  const p = cp === null ? 0.5 : winProb({ cp });
  const h = orientation === 'w' ? p : 1 - p;
  return (
    <div className="eval-bar" style={{ transform: orientation === 'b' ? 'none' : undefined }}>
      <i style={{ height: `${h * 100}%`, background: orientation === 'w' ? '#e9ebef' : '#2a2d35' }} />
      <span style={{ top: 4, color: orientation === 'w' ? '#eee' : '#111' }} />
      {cp !== null && <span style={{ [p >= 0.5 === (orientation === 'w') ? 'bottom' : 'top']: 4, color: p >= 0.5 ? '#111' : '#eee' } as any}>{fmtEval(Math.abs(cp)).replace('+', '')}</span>}
    </div>
  );
}

export default function Analysis() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const me = useSession((s) => s.me);
  const mode3d = useSettings((s) => s.graphics.mode === '3d');
  const [game, setGame] = useState<GameRecord | null>(null);
  const [icons, setIcons] = useState<{ w: string; b: string }>({ w: 'icon.pawn', b: 'icon.pawn' });
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => (params.get('ply') ? Number(params.get('ply')) : -1));
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const loc = useLocation();
  const [explore, setExplore] = useState<{ base: number; moves: { uci: string; san: string }[] } | null>(id ? null : { base: -1, moves: ((loc.state as any)?.moves as { uci: string; san: string }[]) ?? [] });
  const [engineOn, setEngineOn] = useState(!id);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [boxRef, box] = useElementSize<HTMLDivElement>();

  const load = useCallback(() => {
    if (!id) return;
    api
      .get(`/api/games/${id}`)
      .then((r) => {
        if (r.live) return navigate(`/game/${id}`, { replace: true });
        setGame(r.game);
        if (r.icons) setIcons(r.icons);
        const myColor = me && r.game.black_id === me.id ? 'b' : 'w';
        setOrientation(myColor);
        if (!params.get('ply')) setCursor(r.game.moves.length - 1);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(load, [load]);

  const ratings = game?.analysis?.ratings ?? [];
  const ratingMap = useMemo(() => new Map(ratings.map((r) => [r.ply, r])), [ratings]);
  const baseMoves = game?.moves ?? [];

  // position being displayed
  const position = useMemo(() => {
    if (explore) {
      const base = fenAt(baseMoves, explore.base);
      const c = new Chess(base.fen);
      let last = base.last as [Square, Square] | null;
      for (const m of explore.moves) {
        c.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
        last = [m.uci.slice(0, 2), m.uci.slice(2, 4)] as [Square, Square];
      }
      return { fen: c.fen(), last };
    }
    const p = fenAt(baseMoves, cursor);
    return { fen: p.fen, last: p.last as [Square, Square] | null };
  }, [explore, baseMoves, cursor]);

  // engine
  useEffect(() => {
    if (!engineOn) {
      engine.stop();
      setLines([]);
      return;
    }
    const c = new Chess(position.fen);
    if (c.isGameOver()) {
      setLines([]);
      return;
    }
    setLines([]);
    void engine.analyse(position.fen, { depth: 18, multipv: 3 }, (ls) => setLines(ls)).catch(() => toast({ kind: 'error', title: 'Engine unavailable', body: 'Could not load Stockfish in this browser.' }));
    return () => engine.stop();
  }, [engineOn, position.fen]);

  // keyboard
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') {
        if (explore && explore.moves.length) setExplore({ ...explore, moves: explore.moves.slice(0, -1) });
        else setCursor((c) => Math.max(-1, c - 1));
      } else if (e.key === 'ArrowRight') setCursor((c) => Math.min(baseMoves.length - 1, c + 1));
      else if (e.key === 'Home') setCursor(-1);
      else if (e.key === 'End') setCursor(baseMoves.length - 1);
      else if (e.key === 'f') setOrientation((o) => (o === 'w' ? 'b' : 'w'));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [baseMoves.length, explore]);

  const onMove = (from: Square, to: Square, promo?: string) => {
    const c = new Chess(position.fen);
    let m;
    try {
      m = c.move({ from, to, promotion: promo });
    } catch {
      return false;
    }
    const uci = from + to + (m.promotion ?? '');
    // following the game's own next move just advances the replay
    if (!explore && game && baseMoves[cursor + 1]?.uci === uci) {
      setCursor(cursor + 1);
      return true;
    }
    setExplore((ex) => (ex ? { ...ex, moves: [...ex.moves, { uci, san: m.san }] } : { base: cursor, moves: [{ uci, san: m.san }] }));
    return true;
  };

  const requestAnalysis = async () => {
    setAnalysing(true);
    try {
      await api.post(`/api/games/${id}/analyze`);
      load();
    } catch (e) {
      toast({ kind: 'error', title: 'Analysis failed', body: (e as Error).message });
    } finally {
      setAnalysing(false);
    }
  };

  if (id && error) return <div className="page"><Empty title="Game not found">{error}</Empty></div>;
  if (id && !game) return <Loading label="Loading game…" />;

  const cur = !explore ? ratingMap.get(cursor) : undefined;
  const engineEval = lineEvalWhite(lines[0], position.fen);
  const shownEval = engineOn ? engineEval : cur ? cur.evalPlayed : cursor === -1 ? 0 : ratingMap.get(cursor)?.evalPlayed ?? null;
  const boardSize = mode3d ? null : Math.max(240, Math.min(box.width - 24, box.height));
  const arrows: { from: Square; to: Square; color: string }[] = [];
  if (cur && cur.bestMove !== cur.uci && !explore) {
    arrows.push({ from: cur.bestMove.slice(0, 2) as Square, to: cur.bestMove.slice(2, 4) as Square, color: 'rgba(63, 207, 142, 0.75)' });
  }
  if (engineOn && lines[0]?.pv[0]) arrows.push({ from: lines[0].pv[0].slice(0, 2) as Square, to: lines[0].pv[0].slice(2, 4) as Square, color: 'rgba(61, 123, 255, 0.75)' });
  const markers: Marker[] = cur ? [{ square: cur.uci.slice(2, 4) as Square, color: CLASS_META[cur.cls].color + '55', key: 'm' + cursor }] : [];

  const sanLine = (pv: string[]) => {
    const c = new Chess(position.fen);
    const out: string[] = [];
    for (const u of pv.slice(0, 8)) {
      try {
        out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
      } catch {
        break;
      }
    }
    return out.join(' ');
  };

  return (
    <div className="game-layout" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
      <div className="board-col">
        {game && (
          <div className="row between" style={{ width: '100%' }}>
            <div className="row">
              <PlayerIcon id={icons.w} size={28} />
              <span style={{ fontWeight: 700 }}>{game.white_name}</span>
              <span className="muted small">vs</span>
              <PlayerIcon id={icons.b} size={28} />
              <span style={{ fontWeight: 700 }}>{game.black_name}</span>
              <span className="badge">{game.result}</span>
            </div>
            <span className="tiny muted hide-mobile">{END_REASON_LABEL[game.reason]} · {tcLabel({ initial: game.tc_initial, increment: game.tc_increment })} · {fmtDate(game.ended_at)}</span>
          </div>
        )}
        <div className="board-wrap" ref={boxRef} style={{ gap: 10, minHeight: mode3d ? 380 : undefined }}>
          <EvalBar cp={shownEval} orientation={orientation} />
          <div style={{ position: 'relative', width: boardSize ?? '100%', height: boardSize ?? '100%' }}>
            <BoardView fen={position.fen} orientation={orientation} movable="both" onMove={onMove} lastMove={position.last} arrows={arrows} markers={markers} moveKey={`${cursor}|${explore?.moves.length ?? 0}`} />
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" aria-label="First" onClick={() => { setExplore(null); setCursor(-1); }}><ChevronsLeft /></button>
          <button className="icon-btn" aria-label="Previous" onClick={() => (explore && explore.moves.length ? setExplore({ ...explore, moves: explore.moves.slice(0, -1) }) : setCursor((c) => Math.max(-1, c - 1)))}><ChevronLeft /></button>
          <button className="icon-btn" aria-label="Next" onClick={() => { setExplore(null); setCursor((c) => Math.min(baseMoves.length - 1, c + 1)); }}><ChevronRight /></button>
          <button className="icon-btn" aria-label="Last" onClick={() => { setExplore(null); setCursor(baseMoves.length - 1); }}><ChevronsRight /></button>
          <button className="icon-btn" aria-label="Flip" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}><RotateCw /></button>
          <button className={`btn btn-sm ${engineOn ? 'btn-primary' : ''}`} onClick={() => setEngineOn((v) => !v)}><Cpu /> Engine</button>
          {id && (
            <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/analysis/${id}`); toast({ kind: 'success', title: 'Replay link copied', body: 'Anyone with the link can watch this replay.' }); }}>
              <Share2 /> Share
            </button>
          )}
        </div>
      </div>

      <div className="side-col" style={{ overflowY: 'auto' }}>
        {game && (
          <div className="panel panel-pad" style={{ padding: 12 }}>
            {game.opening_name && (
              <div className="row small" style={{ marginBottom: 10 }}>
                <BookOpen size={14} style={{ color: 'var(--accent)' }} />
                <span className="mono muted">{game.opening_eco}</span>
                <Link to={`/explorer`} className="ellipsis" style={{ fontWeight: 600 }}>{game.opening_name}</Link>
              </div>
            )}
            {game.analysis ? (
              <>
                <EvalGraph ratings={ratings} cursor={cursor} onSelect={(p) => { setExplore(null); setCursor(p); }} />
                <div className="grid g2" style={{ gap: 8, marginTop: 10 }}>
                  {(['w', 'b'] as const).map((c) => (
                    <div key={c} className="inset" style={{ padding: 10 }}>
                      <div className="tiny muted">{c === 'w' ? game.white_name : game.black_name}</div>
                      <div className="display mono" style={{ fontWeight: 700, fontSize: '1.25rem' }}>{game.analysis!.accuracy[c].toFixed(1)}%</div>
                      <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                        {(['incredible', 'great', 'bad', 'blunder'] as const).map((k) => (
                          <span key={k} className="row tiny mono" style={{ gap: 3 }}><ClassDot cls={k} size={12} />{countClasses(ratings, c)[k]}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="col" style={{ gap: 8 }}>
                <div className="small muted">This game has not been analysed yet.</div>
                <button className="btn btn-primary btn-sm" onClick={requestAnalysis} disabled={analysing}>{analysing ? <Spinner /> : <Search />} Analyse with Stockfish</button>
              </div>
            )}
          </div>
        )}

        {cur && (
          <div className="panel panel-pad" style={{ padding: 12, borderColor: CLASS_META[cur.cls].color + '88' }}>
            <div className="row between">
              <div className="row">
                <ClassDot cls={cur.cls} size={24} />
                <div>
                  <div style={{ fontWeight: 800, color: CLASS_META[cur.cls].color }}>{Math.floor(cur.ply / 2) + 1}{cur.color === 'w' ? '.' : '...'} {cur.san} is {CLASS_META[cur.cls].label.toLowerCase()}</div>
                  <div className="tiny muted">Evaluation {fmtEval(cur.evalPlayed)} · accuracy {cur.accuracy.toFixed(0)}%</div>
                </div>
              </div>
            </div>
            {cur.bestMove !== cur.uci ? (
              <div className="small" style={{ marginTop: 8 }}>
                Best was <b>{cur.bestSan}</b> ({fmtEval(cur.evalBest)}).
                {cur.loss > 0.02 && <span className="muted"> Expected-score loss: {(cur.loss * 100).toFixed(1)}%.</span>}
              </div>
            ) : (
              <div className="small" style={{ marginTop: 8, color: 'var(--good)' }}>This was the engine's top choice.</div>
            )}
            {cur.flags.length > 0 && (
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {cur.flags.map((f) => <span key={f} className="badge">{f.replace('_', ' ')}</span>)}
              </div>
            )}
            {cur.bestMove !== cur.uci && (
              <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setExplore({ base: cursor - 1, moves: [{ uci: cur.bestMove, san: cur.bestSan }] })}>
                <Sparkles /> Show best move on board
              </button>
            )}
          </div>
        )}

        {explore && (
          <div className="panel panel-pad" style={{ padding: 12 }}>
            <div className="row between">
              <span className="label">Exploring</span>
              {id && <button className="btn btn-sm" onClick={() => setExplore(null)}><Undo2 /> Back to game</button>}
            </div>
            <div className="small" style={{ marginTop: 6 }}>{explore.moves.map((m) => m.san).join(' ') || 'Make moves on the board to explore.'}</div>
          </div>
        )}

        {engineOn && (
          <div className="panel panel-pad" style={{ padding: 12 }}>
            <div className="row between"><span className="label">Stockfish 18 (browser)</span><span className="tiny muted">depth {lines[0]?.depth ?? 0}</span></div>
            {lines.length === 0 ? <div className="row small muted" style={{ marginTop: 8 }}><Spinner /> Thinking…</div> : lines.map((l) => (
              <div key={l.multipv} className="row small" style={{ marginTop: 6, gap: 8 }}>
                <span className="mono badge" style={{ minWidth: 52, justifyContent: 'center' }}>{fmtEval(lineEvalWhite(l, position.fen) ?? 0)}</span>
                <span className="ellipsis">{sanLine(l.pv)}</span>
              </div>
            ))}
          </div>
        )}

        {game && (
          <div className="panel moves-panel" style={{ minHeight: 220 }}>
            <div className="panel-head" style={{ padding: '10px 14px' }}><h3 className="panel-title">Moves</h3></div>
            <MoveList moves={baseMoves} ratings={ratingMap} cursor={explore ? -2 : cursor} onSelect={(p) => { setExplore(null); setCursor(p); }} showRatings />
          </div>
        )}
        {game?.analysis && (
          <div className="panel panel-pad" style={{ padding: 12 }}>
            <div className="label" style={{ marginBottom: 8 }}>{orientation === 'w' ? game.white_name : game.black_name}: move quality</div>
            <ClassBars counts={countClasses(ratings, orientation)} />
          </div>
        )}
      </div>
    </div>
  );
}
