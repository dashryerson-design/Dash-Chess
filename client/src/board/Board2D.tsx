import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import { useBoardLogic } from './logic';
import { FILES, squareXY, xyToSquare, type BoardProps } from './types';
import { pieceUrl } from '../cosmetics/pieces';
import { diffPieces, nextPieceId, type PieceItem } from './diff';
import { boardUrl, boardVisual, HIGHLIGHTS } from '../cosmetics/boards';
import { useSettings } from '../stores/settings';
import { useSession } from '../stores/session';
import { PromotionPicker } from './PromotionPicker';
import './board.css';

interface Fx {
  id: number;
  kind: string;
  square: Square;
  color?: string;
}

export const Board2D = memo(function Board2D(props: BoardProps) {
  const { orientation } = props;
  const gp = useSettings((s) => s.gameplay);
  const gfx = useSettings((s) => s.graphics);
  const equipped = useSession((s) => s.me?.equipped);
  const setId = props.pieceSet ?? equipped?.pieces ?? 'pieces.classic';
  const boardId = props.boardId ?? equipped?.board ?? 'board.wood';
  const moveFx = equipped?.moveEffect ?? 'moveEffect.none';
  const captureFx = equipped?.captureEffect ?? 'captureEffect.fade';
  const checkFx = equipped?.checkEffect ?? 'checkEffect.glow';
  const logic = useBoardLogic(props);
  const bv = boardVisual(boardId);
  const hl = HIGHLIGHTS[gp.highlightColor] ?? HIGHLIGHTS.gold;
  const animMs = gfx.animations === 'off' ? 0 : Math.round((gfx.animations === 'reduced' ? 110 : 200) / gfx.animationSpeed);

  const [items, setItems] = useState<PieceItem[]>(() => diffPieces([], props.fen).pieces);
  const [fx, setFx] = useState<Fx[]>([]);
  const prevFen = useRef(props.fen);

  useLayoutEffect(() => {
    if (prevFen.current === props.fen) return;
    prevFen.current = props.fen;
    setItems((prev) => {
      const { pieces, captured } = diffPieces(prev, props.fen);
      if (captured.length && gp.captureAnimation && gfx.effects) {
        const fxs = captured.map((c) => ({ id: nextPieceId(), kind: captureFx.split('.')[1], square: c.square, color: c.color }));
        setFx((f) => [...f.slice(-6), ...fxs]);
      }
      return [...pieces, ...(gp.captureAnimation && animMs > 0 ? captured : [])];
    });
  }, [props.fen, gp.captureAnimation, gfx.effects, captureFx, animMs]);

  // drop captured ghosts after their animation
  useEffect(() => {
    if (!items.some((i) => i.captured)) return;
    const t = setTimeout(() => setItems((it) => it.filter((i) => !i.captured)), 420);
    return () => clearTimeout(t);
  }, [items]);

  // move effects
  useEffect(() => {
    if (!props.lastMove || props.moveKey === undefined || !gp.moveEffects || !gfx.effects) return;
    const kind = moveFx.split('.')[1];
    if (kind === 'none') return;
    const id = nextPieceId();
    setFx((f) => [...f.slice(-6), { id, kind, square: props.lastMove![1], color: 'move' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.moveKey]);
  useEffect(() => {
    if (!fx.length) return;
    const t = setTimeout(() => setFx((f) => f.slice(1)), 900);
    return () => clearTimeout(t);
  }, [fx]);

  // ------------------------------------------------------------------ pointer handling
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ from: Square; el: HTMLElement | null; startX: number; startY: number; active: boolean; pointerId: number; wasSelected: boolean; orig: string } | null>(null);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);
  const [hover, setHover] = useState<Square | null>(null);

  const squareAt = (clientX: number, clientY: number): Square | null => {
    const r = boardRef.current!.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * 8);
    const y = Math.floor(((clientY - r.top) / r.height) * 8);
    return xyToSquare(x, y, orientation);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || props.movable === null) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (gp.moveInput !== 'click' && logic.canDrag(sq)) {
      const el = boardRef.current!.querySelector<HTMLElement>(`[data-sq="${sq}"]`);
      drag.current = { from: sq, el, startX: e.clientX, startY: e.clientY, active: false, pointerId: e.pointerId, wasSelected: logic.selected === sq, orig: el?.style.transform ?? '' };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      if (gp.moveInput !== 'drag' && logic.selected !== sq) logic.setSelected(sq);
    } else drag.current = null;
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) {
      d.active = true;
      logic.setSelected(d.from);
      setDragFrom(d.from);
    }
    if (d.active && d.el) {
      const r = boardRef.current!.getBoundingClientRect();
      const s = r.width / 8;
      const x = e.clientX - r.left - s / 2;
      const y = e.clientY - r.top - s / 2;
      d.el.style.transition = 'none';
      d.el.style.transform = `translate(${x}px, ${y}px) scale(1.12)`;
      d.el.style.zIndex = '30';
      const sq = squareAt(e.clientX, e.clientY);
      if (sq !== hover) setHover(sq);
    }
  };

  /** Restore the React-managed transform after a drag (never clear it: React would not re-apply an unchanged value). */
  const resetDragEl = (d: NonNullable<typeof drag.current>, animate: boolean) => {
    if (!d.el || !d.active) return;
    const el = d.el;
    if (!animate) el.style.transition = 'none';
    el.style.transform = d.orig;
    el.style.zIndex = '';
    if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => (el.style.transition = '')));
    else el.style.transition = '';
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const sq = squareAt(e.clientX, e.clientY);
    const d = drag.current;
    drag.current = null;
    setHover(null);
    if (d?.active) {
      setDragFrom(null);
      // put the piece back under React's control without animating; if the move is accepted React moves it instantly
      resetDragEl(d, false);
      const ok = logic.dropOn(d.from, sq);
      if (!ok) logic.setSelected(null);
      return;
    }
    if (!sq) return;
    if (d && d.from === sq) {
      // tap on own piece: selected on pointerdown; a second tap deselects it
      if (d.wasSelected) logic.setSelected(null);
      return;
    }
    if (gp.moveInput === 'drag') return;
    logic.clickSquare(sq);
  };

  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    setDragFrom(null);
    setHover(null);
    if (d) resetDragEl(d, true);
  };

  // ------------------------------------------------------------------ render helpers
  const sqStyle = (sq: string): React.CSSProperties => {
    const [x, y] = squareXY(sq, orientation);
    return { transform: `translate(${x * 100}%, ${y * 100}%)` };
  };

  const occupied = useMemo(() => new Set(items.filter((i) => !i.captured).map((i) => i.square)), [items]);
  const showCoords = (props.showCoordinates ?? true) && gp.coordinates !== 'off';

  return (
    <div className={`board2d ${props.className ?? ''}`} style={{ ['--anim-ms' as any]: `${animMs}ms` }}>
      <div className="board2d-frame" style={{ background: bv.frame, boxShadow: `0 0 0 1px ${bv.frameEdge}55, 0 24px 60px rgba(0,0,0,0.55)` }}>
        <div
          ref={boardRef}
          className={`board2d-squares ${props.movable ? 'interactive' : ''}`}
          style={{ backgroundImage: `url("${boardUrl(boardId)}")` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(e) => {
            e.preventDefault();
            if (props.premove) props.onPremoveCancel?.();
            logic.setSelected(null);
          }}
        >
          {/* highlights */}
          {gp.highlightLastMove &&
            props.lastMove?.map((sq) => <div key={'lm' + sq} className="hl" style={{ ...sqStyle(sq), background: hl.last }} />)}
          {props.premove?.map((sq) => <div key={'pm' + sq} className="hl" style={{ ...sqStyle(sq), background: hl.premove }} />)}
          {logic.selected && <div className="hl" style={{ ...sqStyle(logic.selected), background: hl.select }} />}
          {hover && dragFrom && <div className="hl hover" style={sqStyle(hover)} />}
          {logic.checkSquare && gp.checkEffect && <div className={`hl check fx-${checkFx.split('.')[1]}`} style={sqStyle(logic.checkSquare)} />}
          {props.markers?.map((m) => <div key={m.key} className="square-flash" style={{ ...sqStyle(m.square), width: '12.5%', height: '12.5%', background: m.color }} />)}

          {/* legal move indicators */}
          {gp.legalMoves &&
            logic.targets.map((m) => {
              const cap = occupied.has(m.to) || m.flags?.includes('e');
              return (
                <div key={'t' + m.to} className={`target ${gp.legalStyle} ${cap ? 'cap' : ''} ${logic.premoveMode && logic.selected && logic.chess.get(logic.selected)?.color !== logic.turn ? 'pre' : ''}`} style={sqStyle(m.to)}>
                  <i style={{ ['--legal' as any]: hl.legal }} />
                </div>
              );
            })}

          {/* coordinates */}
          {showCoords && (
            <>
              {Array.from({ length: 8 }, (_, i) => {
                const file = orientation === 'w' ? FILES[i] : FILES[7 - i];
                const dark = (i + 7) % 2 === 1;
                return (
                  <span key={'f' + i} className="coord file" style={{ left: `${i * 12.5}%`, color: dark ? bv.coordDark : bv.coordLight }}>
                    {file}
                  </span>
                );
              })}
              {Array.from({ length: 8 }, (_, i) => {
                const rank = orientation === 'w' ? 8 - i : i + 1;
                const dark = i % 2 === 1;
                return (
                  <span key={'r' + i} className="coord rank" style={{ top: `${i * 12.5}%`, color: dark ? bv.coordDark : bv.coordLight }}>
                    {rank}
                  </span>
                );
              })}
            </>
          )}

          {/* pieces */}
          {items.map((it) => (
            <div
              key={it.id}
              data-sq={it.captured ? undefined : it.square}
              data-piece={it.color + it.type}
              className={`piece ${it.captured ? 'captured' : ''} ${dragFrom === it.square && !it.captured ? 'dragging' : ''}`}
              style={{ ...sqStyle(it.square), backgroundImage: `url("${pieceUrl(setId, it.color, it.type)}")` }}
            />
          ))}

          {/* effects */}
          {fx.map((f) => (
            <div key={f.id} className={`fx fx-${f.kind}`} style={sqStyle(f.square)}>
              <i />
              <i />
              <i />
            </div>
          ))}

          {props.ghost && (
            <>
              <div className="hl ghost-from" style={sqStyle(props.ghost.from)} />
              <div className="hl ghost-to" style={sqStyle(props.ghost.to)} />
              <div className="piece ghost-piece" style={{ ...sqStyle(props.ghost.to), backgroundImage: `url("${pieceUrl(setId, props.ghost.piece[0] as 'w' | 'b', props.ghost.piece[1] as any)}")` }} />
            </>
          )}
          {/* arrows */}
          {(props.arrows?.length || props.hint) && (
            <svg className="arrows" viewBox="0 0 800 800">
              {[...(props.arrows ?? []), ...(props.hint ? [{ from: props.hint[0], to: props.hint[1], color: 'rgba(63, 207, 142, 0.85)' }] : [])].map((a, i) => {
                const [x1, y1] = squareXY(a.from, orientation);
                const [x2, y2] = squareXY(a.to, orientation);
                const sx = x1 * 100 + 50;
                const sy = y1 * 100 + 50;
                const ex = x2 * 100 + 50;
                const ey = y2 * 100 + 50;
                const ang = Math.atan2(ey - sy, ex - sx);
                const len = Math.hypot(ex - sx, ey - sy) - 22;
                const tx = sx + Math.cos(ang) * len;
                const ty = sy + Math.sin(ang) * len;
                const hx = 26;
                return (
                  <g key={i} opacity={0.9}>
                    <line x1={sx} y1={sy} x2={tx - Math.cos(ang) * 18} y2={ty - Math.sin(ang) * 18} stroke={a.color} strokeWidth={15} strokeLinecap="round" />
                    <polygon
                      fill={a.color}
                      points={`${tx + Math.cos(ang) * 10},${ty + Math.sin(ang) * 10} ${tx - Math.cos(ang) * hx + Math.cos(ang + Math.PI / 2) * hx},${ty - Math.sin(ang) * hx + Math.sin(ang + Math.PI / 2) * hx} ${tx - Math.cos(ang) * hx - Math.cos(ang + Math.PI / 2) * hx},${ty - Math.sin(ang) * hx - Math.sin(ang + Math.PI / 2) * hx}`}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {logic.promotion && (
            <PromotionPicker
              color={logic.promotion.color}
              square={logic.promotion.to}
              orientation={orientation}
              pieceSet={setId}
              onPick={logic.choosePromotion}
            />
          )}
        </div>
      </div>
    </div>
  );
});
