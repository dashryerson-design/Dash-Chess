import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Chess, type Square } from 'chess.js';
import { Flag, Handshake, Undo2, Lightbulb, X, RotateCw, Eye, Box, Square as SquareIcon, ChevronLeft, ChevronRight, Radio, Trophy } from 'lucide-react';
import { CATEGORY_LABEL, tcLabel, type GameRewards, type GameState, type MoveRating, type Side } from '@dc/shared';
import { emit, getSocket } from '../lib/socket';
import { BoardView } from '../board/BoardView';
import { squareCenterPct, type Marker } from '../board/types';
import { PlayerBar, MoveList, fenAt, ClassPopup } from '../components/GameParts';
import { ResultsModal } from '../components/ResultsModal';
import { Confirm, Empty, Loading } from '../components/ui';
import { useSettings } from '../stores/settings';
import { useSession } from '../stores/session';
import { toast } from '../stores/toasts';
import { moveSound, play } from '../lib/sound';
import { useElementSize } from '../lib/useSize';
import { CLASS_META } from '@dc/shared';

interface Snapshot {
  state: GameState;
  at: number;
}

export default function Game() {
  const { id } = useParams();
  const navigate = useNavigate();
  const gp = useSettings((s) => s.gameplay);
  const mode3d = useSettings((s) => s.graphics.mode === '3d');
  const setSettings = useSettings((s) => s.set);
  const me = useSession((s) => s.me);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Map<number, MoveRating>>(new Map());
  const [popup, setPopup] = useState<{ rating: MoveRating; key: number } | null>(null);
  const [optimistic, setOptimistic] = useState<{ fen: string; last: [Square, Square]; san: string } | null>(null);
  const [premove, setPremove] = useState<{ from: Square; to: Square; promo?: string } | null>(null);
  const [cursor, setCursor] = useState<number | null>(null); // null = live
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState<[Square, Square] | null>(null);
  const [rewards, setRewards] = useState<GameRewards | null>(null);
  const [analysisReady, setAnalysisReady] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [rematchPending, setRematchPending] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const lastSoundPly = useRef<number>(-1);
  const prevStatus = useRef<string | null>(null);
  const [boxRef, box] = useElementSize<HTMLDivElement>();

  const state = snap?.state ?? null;
  const myColor = state?.yourColor ?? null;

  // ------------------------------------------------------------------ socket wiring
  useEffect(() => {
    if (!id) return;
    const s = getSocket();
    let alive = true;
    const join = async () => {
      const r = await emit('game:join', { gameId: id });
      if (!alive) return;
      if (!r.ok) {
        // finished games that are no longer live go to the review screen
        if (r.error?.includes('not found')) navigate(`/analysis/${id}`, { replace: true });
        else setError(r.error ?? 'Could not join game');
        return;
      }
      const st = r.state as GameState;
      lastSoundPly.current = st.moves.length - 1;
      prevStatus.current = st.status;
      setSnap({ state: st, at: performance.now() });
      setRatings(new Map((r.ratings as MoveRating[]).map((x) => [x.ply, x])));
      if (r.rewards) setRewards(r.rewards);
      if (st.status === 'ended') setShowResults(false);
    };
    const onState = (st: GameState) => {
      if (st.id !== id) return;
      setSnap({ state: st, at: performance.now() });
      setOptimistic(null);
    };
    const onRating = (p: { gameId: string; rating: MoveRating }) => {
      if (p.gameId !== id) return;
      setRatings((m) => new Map(m).set(p.rating.ply, p.rating));
      if (useSettings.getState().gameplay.liveRatings) {
        setPopup({ rating: p.rating, key: Date.now() });
        setMarkers([{ square: p.rating.uci.slice(2, 4) as Square, color: CLASS_META[p.rating.cls].color + '66', key: Date.now() }]);
        if (p.rating.cls === 'incredible') play('incredible');
        else if (p.rating.cls === 'great') play('great');
        else if (p.rating.cls === 'blunder') play('blunder');
      }
    };
    const onRewards = (r: GameRewards) => r.gameId === id && setRewards(r);
    const onAnalysis = (p: { gameId: string }) => p.gameId === id && setAnalysisReady((x) => x + 1);
    const onBot = (p: { gameId: string; message: string }) => p.gameId === id && p.message === 'declined_draw' && toast({ kind: 'info', title: 'Draw declined', body: 'The bot wants to keep playing.' });
    s.on('game:state', onState);
    s.on('game:rating', onRating);
    s.on('game:rewards', onRewards);
    s.on('game:analysis', onAnalysis);
    s.on('game:bot', onBot);
    s.on('connect', join);
    if (s.connected) void join();
    return () => {
      alive = false;
      s.off('game:state', onState);
      s.off('game:rating', onRating);
      s.off('game:rewards', onRewards);
      s.off('game:analysis', onAnalysis);
      s.off('game:bot', onBot);
      s.off('connect', join);
      void emit('game:leave', { gameId: id });
    };
  }, [id, navigate]);

  // reset per-game UI state when navigating between games (rematch)
  useEffect(() => {
    setRatings(new Map());
    setRewards(null);
    setCursor(null);
    setPremove(null);
    setHint(null);
    setShowResults(false);
    setRematchPending(false);
    setSnap(null);
  }, [id]);

  // sounds, end of game, premove execution
  useEffect(() => {
    if (!state) return;
    const n = state.moves.length;
    if (n - 1 > lastSoundPly.current) {
      const m = state.moves[n - 1];
      if (!(optimistic && optimistic.san === m.san)) moveSound(m.san);
      lastSoundPly.current = n - 1;
      setHint(null);
    }
    if (prevStatus.current === 'active' && state.status === 'ended') {
      const r = state.result!;
      if (r.reason !== 'aborted' && myColor) play(r.winner === null ? 'draw' : r.winner === myColor ? 'win' : 'lose');
      setShowResults(true);
      setPremove(null);
      useSession.getState().patch({ activeGameId: null });
    }
    prevStatus.current = state.status;
    // premove
    if (premove && state.status === 'active' && myColor && state.fen.split(' ')[1] === myColor) {
      const pm = premove;
      setPremove(null);
      const c = new Chess(state.fen);
      const legal = c.moves({ verbose: true }).find((m) => m.from === pm.from && m.to === pm.to && (!m.promotion || m.promotion === (pm.promo ?? 'q')));
      if (legal) void sendMove(pm.from, pm.to, legal.promotion ? pm.promo ?? 'q' : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // rematch: navigate when server reports a new game for us
  useEffect(() => {
    const s = getSocket();
    const onMatch = (m: { gameId: string }) => {
      if (m.gameId !== id) navigate(`/game/${m.gameId}`);
    };
    s.on('match:found', onMatch);
    return () => void s.off('match:found', onMatch);
  }, [id, navigate]);

  // ------------------------------------------------------------------ actions
  const sendMove = useCallback(
    async (from: Square, to: Square, promotion?: string) => {
      if (!state || !id) return false;
      const c = new Chess(optimistic?.fen ?? state.fen);
      let m;
      try {
        m = c.move({ from, to, promotion });
      } catch {
        return false;
      }
      moveSound(m.san);
      setOptimistic({ fen: c.fen(), last: [from, to], san: m.san });
      setCursor(null);
      const r = await emit('game:move', { gameId: id, uci: from + to + (promotion ?? '') });
      if (!r.ok) {
        setOptimistic(null);
        toast({ kind: 'error', title: 'Move rejected', body: r.error });
      }
      return true;
    },
    [state, id, optimistic],
  );

  const onMove = useCallback((from: Square, to: Square, promo?: string) => {
    void sendMove(from, to, promo);
    return true;
  }, [sendMove]);

  const act = async (ev: string, payload: Record<string, unknown> = {}) => {
    const r = await emit(ev, { gameId: id, ...payload });
    if (!r.ok) toast({ kind: 'error', title: 'Action failed', body: r.error });
    return r;
  };

  const requestHint = async () => {
    const r = await act('game:hint');
    if (r.ok && r.uci) setHint([r.uci.slice(0, 2), r.uci.slice(2, 4)] as [Square, Square]);
  };

  const rematch = async () => {
    const r = await act('game:rematch');
    if (r.ok && r.gameId) navigate(`/game/${r.gameId}`);
    else if (r.ok && r.pending) {
      setRematchPending(true);
      toast({ kind: 'info', title: 'Rematch offered', body: 'Waiting for your opponent.' });
    }
  };

  // keyboard: arrows navigate history, F flips
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!state || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const n = state.moves.length;
      if (e.key === 'ArrowLeft') setCursor((c) => Math.max(-1, (c ?? n - 1) - 1));
      else if (e.key === 'ArrowRight') setCursor((c) => (c === null || c + 1 >= n - 1 ? null : c + 1));
      else if (e.key === 'f' || e.key === 'F') setFlipped((f) => !f);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [state]);

  // ------------------------------------------------------------------ derived view
  const viewing = cursor !== null && state ? fenAt(state.moves, cursor) : null;
  const liveFen = optimistic?.fen ?? state?.fen ?? new Chess().fen();
  const liveLast = optimistic?.last ?? (state?.moves.length ? ([state.moves[state.moves.length - 1].uci.slice(0, 2), state.moves[state.moves.length - 1].uci.slice(2, 4)] as [Square, Square]) : null);
  const fen = viewing?.fen ?? liveFen;
  const lastMove = (viewing ? viewing.last : liveLast) as [Square, Square] | null;
  const baseOrientation: Side = gp.orientation === 'white' ? 'w' : gp.orientation === 'black' ? 'b' : myColor ?? 'w';
  const orientation: Side = flipped ? (baseOrientation === 'w' ? 'b' : 'w') : baseOrientation;
  const active = state?.status === 'active';
  const movable = active && myColor && cursor === null ? myColor : null;
  const turn: Side = (liveFen.split(' ')[1] as Side) ?? 'w';
  const showRatings = !!(state && (state.liveRatings || state.status === 'ended'));
  const moveList = useMemo(() => (state ? [...state.moves, ...(optimistic && optimistic.san ? [{ san: optimistic.san, uci: '' }] : [])] : []), [state, optimistic]);

  if (error)
    return (
      <div className="page page-narrow">
        <Empty icon={<X />} title="Unable to open this game">{error}</Empty>
        <div className="row center"><button className="btn" onClick={() => navigate('/')}>Back to home</button></div>
      </div>
    );
  if (!state) return <Loading label="Joining match…" />;

  const top: Side = orientation === 'w' ? 'b' : 'w';
  const bottom: Side = orientation;
  const seat = (s: Side) => (s === 'w' ? state.white : state.black);
  const clockMs = (s: Side) => {
    if (!state.clock) return null;
    const base = state.clock[s];
    return state.clock.running && state.clock.turn === s ? base - state.clock.elapsed : base;
  };
  const clockActive = (s: Side) => !!state.clock?.running && state.clock.turn === s && !optimistic;
  const ply = state.moves.length - 1;
  const popupPos = popup && popup.rating.ply === ply ? squareCenterPct(popup.rating.uci.slice(2, 4), orientation) : null;
  const opp = myColor ? (myColor === 'w' ? 'b' : 'w') : null;
  const boardSize = mode3d ? null : Math.max(240, Math.min(box.width, box.height));

  return (
    <div className="game-layout">
      <div className="board-col">
        <PlayerBar seat={seat(top)} side={top} clock={clockMs(top)} active={clockActive(top)} receivedAt={snap!.at} fen={liveFen} turn={active && turn === top}
          right={seat(top).kind === 'bot' && active && turn === top ? <span className="tiny muted hide-xs" style={{ marginRight: 8 }}>thinking…</span> : null} />
        <div className="board-wrap" ref={boxRef} style={{ minHeight: mode3d ? 380 : undefined }}>
          <div style={{ position: 'relative', width: boardSize ?? '100%', height: boardSize ?? '100%', maxWidth: '100%' }}>
            <BoardView
              fen={fen}
              orientation={orientation}
              movable={movable}
              lastMove={lastMove}
              onMove={onMove}
              allowPremove={gp.premoves && !!myColor}
              premove={premove ? [premove.from, premove.to] : null}
              onPremove={(from, to, promo) => setPremove({ from, to, promo })}
              onPremoveCancel={() => setPremove(null)}
              hint={hint}
              markers={markers}
              moveKey={state.moves.length + (optimistic ? 0.5 : 0)}
            />
            {popup && popupPos && gp.liveRatings && !mode3d && <ClassPopup key={popup.key} rating={popup.rating} pos={popupPos} />}
            {popup && mode3d && gp.liveRatings && popup.rating.ply === ply && (
              <ClassPopup key={popup.key} rating={popup.rating} pos={[50, 14]} />
            )}
          </div>
        </div>
        <PlayerBar seat={seat(bottom)} side={bottom} clock={clockMs(bottom)} active={clockActive(bottom)} receivedAt={snap!.at} fen={liveFen} turn={active && turn === bottom} lowWarn={bottom === myColor} />
      </div>

      <div className="side-col">
        <div className="panel panel-pad" style={{ padding: 12 }}>
          <div className="row between">
            <div className="row" style={{ gap: 8 }}>
              {state.mode === 'ranked' ? <Trophy size={16} style={{ color: 'var(--accent)' }} /> : <Radio size={16} style={{ color: 'var(--text-2)' }} />}
              <span style={{ fontWeight: 700 }}>{state.mode === 'bot' ? 'Bot match' : state.mode === 'ranked' ? 'Ranked' : state.mode === 'private' ? 'Private match' : 'Casual'}</span>
              <span className="muted small">{CATEGORY_LABEL[state.category]} · {tcLabel(state.settings.tc)}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {state.spectators > 0 && <span className="badge"><Eye /> {state.spectators}</span>}
              <button className="icon-btn sm" title={mode3d ? 'Switch to 2D' : 'Switch to 3D'} onClick={() => setSettings('graphics', { mode: mode3d ? '2d' : '3d' })}>
                {mode3d ? <SquareIcon /> : <Box />}
              </button>
              <button className="icon-btn sm" title="Flip board (F)" onClick={() => setFlipped((f) => !f)}><RotateCw /></button>
            </div>
          </div>
          {!myColor && <div className="small muted" style={{ marginTop: 8 }}><Eye size={14} style={{ verticalAlign: -2 }} /> You are spectating this game.</div>}
          {state.abortIn !== null && active && myColor && <div className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>Make your first move or the game will be aborted.</div>}
          {state.opponentGoneFor !== null && active && (
            <div className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>Opponent disconnected. They forfeit in {Math.ceil(state.opponentGoneFor / 1000)}s if they do not return.</div>
          )}
        </div>

        {active && myColor && state.drawOffer === opp && (
          <div className="offer-bar">
            <Handshake size={16} /> <span className="grow">Your opponent offers a draw</span>
            <button className="btn btn-sm btn-good" onClick={() => act('game:draw', { action: 'accept' })}>Accept</button>
            <button className="btn btn-sm" onClick={() => act('game:draw', { action: 'decline' })}>Decline</button>
          </div>
        )}
        {active && myColor && state.takebackOffer === opp && (
          <div className="offer-bar">
            <Undo2 size={16} /> <span className="grow">Opponent requests a takeback</span>
            <button className="btn btn-sm btn-good" onClick={() => act('game:takeback', { action: 'accept' })}>Allow</button>
            <button className="btn btn-sm" onClick={() => act('game:takeback', { action: 'decline' })}>Refuse</button>
          </div>
        )}
        {state.status === 'ended' && state.rematchOffer && state.rematchOffer === opp && (
          <div className="offer-bar">
            <RotateCw size={16} /> <span className="grow">Opponent wants a rematch</span>
            <button className="btn btn-sm btn-good" onClick={rematch}>Accept</button>
          </div>
        )}

        <div className="panel moves-panel">
          <div className="panel-head" style={{ padding: '10px 14px' }}>
            <h3 className="panel-title">Moves</h3>
            <div className="row" style={{ gap: 4 }}>
              <button className="icon-btn sm" aria-label="Previous move" onClick={() => setCursor((c) => Math.max(-1, (c ?? ply) - 1))}><ChevronLeft /></button>
              <button className="icon-btn sm" aria-label="Next move" onClick={() => setCursor((c) => (c === null || c + 1 >= ply ? null : c + 1))}><ChevronRight /></button>
              {cursor !== null && <button className="btn btn-sm" onClick={() => setCursor(null)}>Live</button>}
            </div>
          </div>
          <MoveList moves={moveList} ratings={ratings} cursor={cursor ?? moveList.length - 1} onSelect={(p) => setCursor(p >= ply ? null : p)} showRatings={showRatings && gp.liveRatings} />
        </div>

        {myColor && active && (
          <div className="game-actions">
            {state.moves.length < 2 ? (
              <button className="btn" onClick={() => act('game:abort')}><X /> Abort</button>
            ) : (
              <button className="btn btn-danger" onClick={() => (gp.confirmResign ? setConfirmResign(true) : act('game:resign'))}><Flag /> Resign</button>
            )}
            <button className="btn" onClick={() => act('game:draw', { action: 'offer' })} disabled={state.drawOffer === myColor || state.moves.length < 2} title="Offer draw"><Handshake /> Draw</button>
            <button className="btn" onClick={() => act('game:takeback', { action: 'request' })} disabled={!state.settings.takebacks || state.settings.rated} title="Takeback"><Undo2 /> Undo</button>
            <button className="btn" onClick={requestHint} disabled={!state.settings.assistance || state.settings.rated || turn !== myColor} title="Hint (disables move-quality points)"><Lightbulb /> Hint</button>
          </div>
        )}
        {state.status === 'ended' && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" onClick={() => setShowResults(true)}>Results</button>
            <button className="btn grow" onClick={() => navigate(`/analysis/${state.id}`)}>Review</button>
          </div>
        )}
        {state.settings.assistance && !state.settings.rated && myColor && active && (
          <div className="tiny muted">Move assistance is on: live move ratings are shown. Using hints or takebacks removes move-quality DC Points for this game.</div>
        )}
      </div>

      <Confirm open={confirmResign} title="Resign this game?" body="Your opponent will be awarded the win." confirmLabel="Resign" danger onCancel={() => setConfirmResign(false)} onConfirm={() => { setConfirmResign(false); void act('game:resign'); }} />
      {state.status === 'ended' && state.result && (
        <ResultsModal open={showResults} onClose={() => setShowResults(false)} state={state} rewards={rewards} analysisReady={analysisReady} onRematch={rematch} rematchPending={rematchPending} />
      )}
    </div>
  );
}
