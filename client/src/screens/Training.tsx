import { useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { GraduationCap, RefreshCw, Lightbulb, Undo2, ChevronLeft, Check, X, Cpu } from 'lucide-react';
import { BoardView } from '../board/BoardView';
import { engine } from '../engine/clientEngine';
import { moveSound, play } from '../lib/sound';
import { useElementSize } from '../lib/useSize';
import { useSettings } from '../stores/settings';
import { Seg } from '../components/ui';

interface Drill {
  id: string;
  name: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert' | 'Practice';
  fen: string;
  goal: 'mate' | 'promote' | 'hold';
  description: string;
  maxMoves?: number;
}

const DRILLS: Drill[] = [
  { id: 'kq', name: 'Queen checkmate', level: 'Beginner', fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1', goal: 'mate', description: 'Use king and queen together to drive the lone king to the edge and mate. Watch out for stalemate!' },
  { id: 'kr', name: 'Rook checkmate', level: 'Beginner', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', goal: 'mate', description: 'Box the king in with the rook, bring your king up, and deliver mate on the edge.' },
  { id: 'kbb', name: 'Two bishops mate', level: 'Intermediate', fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', goal: 'mate', description: 'Bishops side by side form a wall. Push the king to a corner.' },
  { id: 'kp', name: 'King and pawn', level: 'Intermediate', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', goal: 'promote', description: 'Your king is in front of the pawn on the sixth rank. Use the opposition to promote safely.' },
  { id: 'lucena', name: 'Lucena position', level: 'Advanced', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', goal: 'promote', description: 'The most important winning technique in rook endgames: "build a bridge" and promote.' },
  { id: 'philidor', name: 'Philidor defence', level: 'Advanced', fen: '4k3/8/7r/3PK3/8/8/8/R7 b - - 0 1', goal: 'hold', maxMoves: 30, description: 'You are Black. Keep your rook on the sixth rank until the pawn advances, then check from behind. Survive 30 moves.' },
  { id: 'kbn', name: 'Bishop and knight mate', level: 'Expert', fen: '8/8/8/8/3k4/8/3K4/3BN3 w - - 0 1', goal: 'mate', description: 'The hardest basic mate: force the king into a corner of your bishop\'s colour. You have 50 moves.' },
  { id: 'free', name: 'Free practice', level: 'Practice', fen: new Chess().fen(), goal: 'mate', description: 'Play a full game against the engine at the strength you choose, with hints and takebacks. No rewards.' },
];

function DrillBoard({ drill, onBack }: { drill: Drill; onBack: () => void }) {
  const me = new Chess(drill.fen).turn();
  const [chess] = useState(() => new Chess(drill.fen));
  const [fen, setFen] = useState(drill.fen);
  const [last, setLast] = useState<[Square, Square] | null>(null);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [message, setMessage] = useState<string>('');
  const [hint, setHint] = useState<[Square, Square] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [skill, setSkill] = useState(drill.id === 'free' ? 8 : 20);
  const [boxRef, box] = useElementSize<HTMLDivElement>();
  const mode3d = useSettings((s) => s.graphics.mode === '3d');
  const plies = useRef(0);

  const check = () => {
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'b' : 'w';
      if (winner === me) {
        setStatus('won');
        setMessage('Checkmate! Drill complete.');
        play('win');
      } else {
        setStatus('lost');
        setMessage('You were checkmated.');
        play('lose');
      }
      return true;
    }
    if (chess.isDraw() || chess.isStalemate()) {
      if (drill.goal === 'hold') {
        setStatus('won');
        setMessage('Draw secured. Well defended!');
        play('win');
      } else {
        setStatus('lost');
        setMessage(chess.isStalemate() ? 'Stalemate: careful with your last moves.' : 'The game was drawn.');
        play('draw');
      }
      return true;
    }
    if (drill.goal === 'hold' && drill.maxMoves && plies.current >= drill.maxMoves * 2) {
      setStatus('won');
      setMessage(`You held for ${drill.maxMoves} moves.`);
      play('win');
      return true;
    }
    return false;
  };

  const engineReply = async () => {
    setThinking(true);
    const best = await engine.bestMove(chess.fen(), { movetime: 500, skill });
    setThinking(false);
    if (!best) return;
    const m = chess.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] });
    plies.current++;
    moveSound(m.san);
    setFen(chess.fen());
    setLast([m.from, m.to]);
    if (drill.goal === 'promote' && m.promotion && m.color !== me) {
      setStatus('lost');
      setMessage('Your opponent promoted.');
    }
    check();
  };

  useEffect(() => {
    if (chess.turn() !== me) void engineReply();
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMove = (from: Square, to: Square, promo?: string) => {
    if (status !== 'playing' || thinking) return false;
    let m;
    try {
      m = chess.move({ from, to, promotion: promo });
    } catch {
      return false;
    }
    plies.current++;
    moveSound(m.san);
    setFen(chess.fen());
    setLast([m.from, m.to]);
    setHint(null);
    if (drill.goal === 'promote' && m.promotion) {
      setStatus('won');
      setMessage('Promoted! The rest is technique.');
      play('win');
      return true;
    }
    if (!check()) void engineReply();
    return true;
  };

  const reset = () => {
    chess.load(drill.fen);
    plies.current = 0;
    setFen(drill.fen);
    setLast(null);
    setStatus('playing');
    setMessage('');
    setHint(null);
    if (chess.turn() !== me) void engineReply();
  };

  const undo = () => {
    if (thinking) return;
    chess.undo();
    if (chess.turn() !== me) chess.undo();
    plies.current = Math.max(0, plies.current - 2);
    setFen(chess.fen());
    setLast(null);
    setStatus('playing');
    setMessage('');
  };

  const getHint = async () => {
    const best = await engine.bestMove(chess.fen(), { depth: 16 });
    if (best) setHint([best.slice(0, 2), best.slice(2, 4)] as [Square, Square]);
  };

  const size = mode3d ? null : Math.max(240, Math.min(box.width, box.height));
  return (
    <div className="game-layout">
      <div className="board-col">
        <div className="board-wrap" ref={boxRef} style={{ minHeight: mode3d ? 380 : undefined }}>
          <div style={{ width: size ?? '100%', height: size ?? '100%' }}>
            <BoardView fen={fen} orientation={me} movable={status === 'playing' && !thinking ? me : null} onMove={onMove} lastMove={last} hint={hint} moveKey={plies.current} />
          </div>
        </div>
      </div>
      <div className="side-col">
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onBack}><ChevronLeft /> All drills</button>
        <div className="panel panel-pad col" style={{ gap: 10 }}>
          <div className="row between"><h3 className="panel-title"><GraduationCap /> {drill.name}</h3><span className="badge">{drill.level}</span></div>
          <p className="small dim" style={{ margin: 0 }}>{drill.description}</p>
          <div className="small"><b>Goal:</b> {drill.goal === 'mate' ? 'deliver checkmate' : drill.goal === 'promote' ? 'promote your pawn' : `hold the draw for ${drill.maxMoves} moves`} · you play {me === 'w' ? 'White' : 'Black'}</div>
          {thinking && <div className="row small muted"><Cpu size={14} /> Engine thinking…</div>}
          {status !== 'playing' && (
            <div className="row" style={{ fontWeight: 700, color: status === 'won' ? 'var(--good)' : 'var(--bad)' }}>{status === 'won' ? <Check /> : <X />} {message}</div>
          )}
          {drill.id === 'free' && (
            <div className="field">
              <label>Engine skill: {skill}</label>
              <input className="range" type="range" min={0} max={20} value={skill} onChange={(e) => setSkill(Number(e.target.value))} />
            </div>
          )}
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" onClick={getHint} disabled={status !== 'playing'}><Lightbulb /> Hint</button>
            <button className="btn" onClick={undo}><Undo2 /> Undo</button>
            <button className="btn btn-primary" onClick={reset}><RefreshCw /> Restart</button>
          </div>
        </div>
        <div className="tiny muted">Training runs on the in-browser engine. It is for practice only and does not affect ratings or rewards.</div>
      </div>
    </div>
  );
}

export default function Training() {
  const [drill, setDrill] = useState<Drill | null>(null);
  const [level, setLevel] = useState('All');
  if (drill) return <DrillBoard key={drill.id} drill={drill} onBack={() => setDrill(null)} />;
  const levels = ['All', 'Beginner', 'Intermediate', 'Advanced', 'Expert', 'Practice'];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Training</h1>
          <p className="page-sub">Essential endgame techniques and free practice against Stockfish.</p>
        </div>
        <Seg options={levels.map((l) => ({ value: l, label: l }))} value={level} onChange={setLevel} />
      </div>
      <div className="auto-grid" style={{ ['--min' as any]: '260px' }}>
        {DRILLS.filter((d) => level === 'All' || d.level === level).map((d) => (
          <button key={d.id} className="item-card" style={{ ['--rc' as any]: 'var(--accent)' }} onClick={() => setDrill(d)}>
            <div className="ic-prev" style={{ aspectRatio: '16 / 9', padding: 12 }}>
              <div style={{ height: '100%', aspectRatio: '1' }}>
                <BoardView mode="2d" fen={d.fen} orientation={new Chess(d.fen).turn()} movable={null} showCoordinates={false} />
              </div>
            </div>
            <div className="ic-body">
              <div className="row between"><span className="ic-name">{d.name}</span><span className="badge">{d.level}</span></div>
              <div className="tiny muted">{d.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
