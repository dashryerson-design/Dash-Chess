import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chess, type Square } from 'chess.js';
import { Flag, Handshake, RotateCw, RefreshCw, Undo2, Search } from 'lucide-react';
import { tcLabel, END_REASON_LABEL, type EndReason, type SeatInfo } from '@dc/shared';
import { BoardView } from '../board/BoardView';
import { PlayerBar, MoveList } from '../components/GameParts';
import { Modal, Switch } from '../components/ui';
import { moveSound, play } from '../lib/sound';
import { useElementSize } from '../lib/useSize';
import { ViewToggle } from '../components/ViewToggle';
import { useSettings } from '../stores/settings';

const seat = (name: string, icon: string): SeatInfo => ({ kind: 'human', id: name, name, icon, card: 'card.carbon', level: null, rating: null, provisional: false, connected: true });

/** Pass-and-play on one device. Fully client-side; no rewards. */
export default function LocalGame() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initial = Number(params.get('i') ?? 600) * 1000;
  const inc = Number(params.get('inc') ?? 0) * 1000;
  const timed = initial > 0;
  const mode3d = useSettings((s) => s.graphics.mode === '3d');
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState<{ san: string; uci: string }[]>([]);
  const [clock, setClock] = useState({ w: initial, b: initial });
  const [turnStart, setTurnStart] = useState(performance.now());
  const [result, setResult] = useState<{ winner: 'w' | 'b' | null; reason: EndReason } | null>(null);
  const [autoFlip, setAutoFlip] = useState(true);
  const [flip, setFlip] = useState(false);
  const [boxRef, box] = useElementSize<HTMLDivElement>();
  const timer = useRef<number>();

  const turn = fen.split(' ')[1] as 'w' | 'b';
  const started = moves.length > 0;

  useEffect(() => {
    if (!timed || result || !started) return;
    window.clearTimeout(timer.current);
    const left = clock[turn] - (performance.now() - turnStart);
    timer.current = window.setTimeout(() => {
      const opp = turn === 'w' ? 'b' : 'w';
      setClock((c) => ({ ...c, [turn]: 0 }));
      setResult({ winner: opp, reason: 'timeout' });
      play('draw');
    }, Math.max(0, left));
    return () => window.clearTimeout(timer.current);
  }, [turn, turnStart, timed, result, started, clock]);

  const onMove = (from: Square, to: Square, promo?: string) => {
    if (result) return false;
    let m;
    try {
      m = chess.move({ from, to, promotion: promo });
    } catch {
      return false;
    }
    const now = performance.now();
    if (timed && started) setClock((c) => ({ ...c, [m.color]: c[m.color] - (now - turnStart) + inc }));
    setTurnStart(now);
    setMoves((ms) => [...ms, { san: m.san, uci: m.from + m.to + (m.promotion ?? '') }]);
    setFen(chess.fen());
    moveSound(m.san);
    let r: { winner: 'w' | 'b' | null; reason: EndReason } | null = null;
    if (chess.isCheckmate()) r = { winner: m.color, reason: 'checkmate' };
    else if (chess.isStalemate()) r = { winner: null, reason: 'stalemate' };
    else if (chess.isInsufficientMaterial()) r = { winner: null, reason: 'insufficient_material' };
    else if (chess.isThreefoldRepetition()) r = { winner: null, reason: 'repetition' };
    else if (chess.isDrawByFiftyMoves()) r = { winner: null, reason: 'fifty_moves' };
    if (r) {
      setResult(r);
      play(r.winner ? 'win' : 'draw');
    }
    return true;
  };

  const undo = () => {
    if (result || !moves.length) return;
    chess.undo();
    setMoves((ms) => ms.slice(0, -1));
    setFen(chess.fen());
    setTurnStart(performance.now());
  };

  const reset = () => {
    chess.reset();
    setFen(chess.fen());
    setMoves([]);
    setClock({ w: initial, b: initial });
    setResult(null);
    setTurnStart(performance.now());
  };

  const orientation: 'w' | 'b' = autoFlip ? turn : flip ? 'b' : 'w';
  const top = orientation === 'w' ? 'b' : 'w';
  const bottom = orientation;
  const ms = (s: 'w' | 'b') => (timed ? clock[s] : null);
  const ticking = (s: 'w' | 'b') => timed && started && !result && turn === s;
  const last = moves.length ? ([moves[moves.length - 1].uci.slice(0, 2), moves[moves.length - 1].uci.slice(2, 4)] as [Square, Square]) : null;
  const seats = useMemo(() => ({ w: seat('White', 'icon.king'), b: seat('Black', 'icon.knight') }), []);
  const size = mode3d ? null : Math.max(240, Math.min(box.width, box.height));

  return (
    <div className="game-layout">
      <div className="board-col">
        <PlayerBar seat={seats[top]} side={top} clock={ms(top)} active={ticking(top)} receivedAt={turnStart} fen={fen} turn={!result && turn === top} />
        <div className="board-wrap" ref={boxRef} style={{ minHeight: mode3d ? 380 : undefined }}>
          <div style={{ width: size ?? '100%', height: size ?? '100%' }}>
            <BoardView fen={fen} orientation={orientation} movable={result ? null : 'both'} onMove={onMove} lastMove={last} moveKey={moves.length} />
          </div>
        </div>
        <PlayerBar seat={seats[bottom]} side={bottom} clock={ms(bottom)} active={ticking(bottom)} receivedAt={turnStart} fen={fen} turn={!result && turn === bottom} />
      </div>
      <div className="side-col">
        <div className="panel panel-pad" style={{ padding: 12 }}>
          <div className="row between">
            <span style={{ fontWeight: 700 }}>Local match · {timed ? tcLabel({ initial: initial / 1000, increment: inc / 1000 }) : 'Untimed'}</span>
            <button className="icon-btn sm" onClick={() => { setAutoFlip(false); setFlip((f) => !f); }}><RotateCw /></button>
          </div>
          <div style={{ marginTop: 10 }}><ViewToggle /></div>
          <div className="setting-row" style={{ paddingBottom: 0 }}>
            <div className="small">Rotate board each turn</div>
            <Switch checked={autoFlip} onChange={setAutoFlip} />
          </div>
        </div>
        <div className="panel moves-panel">
          <div className="panel-head" style={{ padding: '10px 14px' }}><h3 className="panel-title">Moves</h3></div>
          <MoveList moves={moves} ratings={new Map()} cursor={moves.length - 1} onSelect={() => {}} showRatings={false} />
        </div>
        <div className="game-actions">
          <button className="btn btn-danger" disabled={!!result || !started} onClick={() => { setResult({ winner: turn === 'w' ? 'b' : 'w', reason: 'resignation' }); play('lose'); }}><Flag /> Resign</button>
          <button className="btn" disabled={!!result || !started} onClick={() => { setResult({ winner: null, reason: 'agreement' }); play('draw'); }}><Handshake /> Draw</button>
          <button className="btn" disabled={!!result || !moves.length} onClick={undo}><Undo2 /> Undo</button>
          <button className="btn" onClick={reset}><RefreshCw /> New</button>
        </div>
      </div>
      <Modal open={!!result} onClose={() => {}} closable={false} title={result ? (result.winner ? `${result.winner === 'w' ? 'White' : 'Black'} wins` : 'Draw') : ''}
        footer={<>
          <button className="btn" onClick={() => navigate('/analysis', { state: { moves } })}><Search /> Analyse</button>
          <button className="btn" onClick={() => navigate('/')}>Home</button>
          <button className="btn btn-primary" onClick={reset}>Play again</button>
        </>}>
        <div className="dim">{result && END_REASON_LABEL[result.reason]} after {Math.ceil(moves.length / 2)} moves.</div>
        <div className="tiny muted" style={{ marginTop: 8 }}>Local games are not recorded and do not award XP or DC Points.</div>
      </Modal>
    </div>
  );
}
