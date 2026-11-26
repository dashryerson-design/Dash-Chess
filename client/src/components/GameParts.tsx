import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { WifiOff } from 'lucide-react';
import { CLASS_META, type MoveRating, type SeatInfo, type MoveRecord } from '@dc/shared';
import { PlayerIcon } from '../cosmetics/icons';
import { pieceUrl } from '../cosmetics/pieces';
import { cardCss } from '../cosmetics/environments';
import { ClassDot, Division } from './ui';
import { fmtClock } from '../lib/format';
import { play } from '../lib/sound';
import { useSession } from '../stores/session';

/** Smoothly ticking clock derived from authoritative server snapshots. */
export function ClockView({ ms, active, receivedAt, lowWarn }: { ms: number | null; active: boolean; receivedAt: number; lowWarn?: boolean }) {
  const [, force] = useState(0);
  const warned = useRef(false);
  useEffect(() => {
    if (!active || ms === null) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 90) {
        last = t;
        force((x) => x + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, ms, receivedAt]);
  if (ms === null) return <div className="clock" style={{ opacity: 0.5 }}>∞</div>;
  const left = active ? Math.max(0, ms - (performance.now() - receivedAt)) : ms;
  const low = left < 20_000;
  if (lowWarn && active && left < 10_000 && !warned.current) {
    warned.current = true;
    play('lowtime');
  }
  if (left > 10_000) warned.current = false;
  return <div className={`clock ${active ? 'active' : ''} ${low ? 'low' : ''}`}>{fmtClock(left)}</div>;
}

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Pieces captured *by* `side`, and material advantage. */
export function capturedBy(fen: string, side: 'w' | 'b') {
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const count: Record<'w' | 'b', Record<string, number>> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) {
    if (!/[pnbrqPNBRQ]/.test(ch)) continue;
    const c = ch === ch.toUpperCase() ? 'w' : 'b';
    count[c][ch.toLowerCase()]++;
  }
  const opp = side === 'w' ? 'b' : 'w';
  const list: string[] = [];
  for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = 0; i < Math.max(0, start[t] - count[opp][t]); i++) list.push(t);
  const mat = (c: 'w' | 'b') => Object.entries(count[c]).reduce((s, [t, n]) => s + VAL[t] * n, 0);
  return { list, adv: mat(side) - mat(opp) };
}

export const Captured = memo(function Captured({ fen, side, pieceSet }: { fen: string; side: 'w' | 'b'; pieceSet: string }) {
  const { list, adv } = capturedBy(fen, side);
  const opp = side === 'w' ? 'b' : 'w';
  return (
    <div className="captured">
      {list.map((t, i) => (
        <img key={i} src={pieceUrl(pieceSet, opp, t as any)} alt="" />
      ))}
      {adv > 0 && <span className="adv">+{adv}</span>}
    </div>
  );
});

export function PlayerBar({ seat, side, clock, active, receivedAt, fen, turn, right, lowWarn }: { seat: SeatInfo; side: 'w' | 'b'; clock: number | null; active: boolean; receivedAt: number; fen: string; turn: boolean; right?: ReactNode; lowWarn?: boolean }) {
  const pieceSet = useSession((s) => s.me?.equipped.pieces) ?? 'pieces.classic';
  return (
    <div className={`player-bar ${turn ? 'turn' : ''}`}>
      <div style={{ position: 'absolute', inset: 0, background: cardCss(seat.card), opacity: 0.32 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(8,10,14,0.65), rgba(8,10,14,0.9))' }} />
      <div className="row grow" style={{ position: 'relative', minWidth: 0 }}>
        <PlayerIcon id={seat.icon} size={40} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="pb-name">
            <span className="ellipsis">{seat.name}</span>
            {!seat.connected && <WifiOff size={14} style={{ color: 'var(--bad)' }} />}
            <span style={{ width: 10, height: 10, borderRadius: 2, background: side === 'w' ? '#eee' : '#222', border: '1px solid #666', flex: 'none' }} />
          </div>
          <div className="pb-sub">
            {seat.rating !== null && (seat.kind === 'human' || seat.id.startsWith('rival_') ? <Division rating={seat.rating} size={14} showRating provisional={seat.provisional} /> : <span className="mono">~{seat.rating}</span>)}
            {seat.level !== null && <span className="muted">LV {seat.level}</span>}
            <Captured fen={fen} side={side} pieceSet={pieceSet} />
          </div>
        </div>
      </div>
      <div style={{ position: 'relative' }} className="row">
        {right}
        <ClockView ms={clock} active={active} receivedAt={receivedAt} lowWarn={lowWarn} />
      </div>
    </div>
  );
}

export function MoveList({ moves, ratings, cursor, onSelect, showRatings }: { moves: { san: string }[]; ratings: Map<number, MoveRating>; cursor: number; onSelect: (ply: number) => void; showRatings: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scroll only the list itself (scrollIntoView would also scroll the page on mobile)
    const box = ref.current;
    if (!box) return;
    const el = box.querySelector('.cur') as HTMLElement | null;
    if (!el) {
      if (cursor === moves.length - 1) box.scrollTop = box.scrollHeight;
      return;
    }
    const top = el.offsetTop;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + el.offsetHeight - box.clientHeight;
  }, [cursor, moves.length]);
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    const cell = (ply: number) => {
      const m = moves[ply];
      if (!m) return <span />;
      const r = showRatings ? ratings.get(ply) : undefined;
      return (
        <span className={`move-cell ${cursor === ply ? 'cur' : ''}`} onClick={() => onSelect(ply)} title={r ? CLASS_META[r.cls].label : undefined}>
          {r && <ClassDot cls={r.cls} size={14} />}
          {m.san}
        </span>
      );
    };
    rows.push(
      <div className="move-row" key={i}>
        <span className="move-no">{i / 2 + 1}.</span>
        {cell(i)}
        {cell(i + 1)}
      </div>,
    );
  }
  return (
    <div className="moves-scroll" ref={ref}>
      {rows.length ? rows : <div className="empty small" style={{ padding: 24 }}>No moves yet</div>}
    </div>
  );
}

/** FEN after `ply` (inclusive) moves; ply = -1 means start position. */
export function fenAt(moves: (MoveRecord | { uci: string })[], ply: number): { fen: string; last: [string, string] | null } {
  const c = new Chess();
  let last: [string, string] | null = null;
  for (let i = 0; i <= ply && i < moves.length; i++) {
    const u = moves[i].uci;
    c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    last = [u.slice(0, 2), u.slice(2, 4)];
  }
  return { fen: c.fen(), last };
}

export function ClassPopup({ rating, pos }: { rating: MoveRating; pos: [number, number] }) {
  const m = CLASS_META[rating.cls];
  return (
    <div className={`cls-pop ${rating.cls}`} style={{ left: `${pos[0]}%`, top: `${pos[1] - 4}%`, ['--c' as any]: m.color }}>
      <ClassDot cls={rating.cls} size={20} />
      {m.label}
    </div>
  );
}
