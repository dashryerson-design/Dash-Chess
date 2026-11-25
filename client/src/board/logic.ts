import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import type { BoardProps } from './types';
import { useSettings } from '../stores/settings';
import { play } from '../lib/sound';

function turnSwapped(fen: string, side: 'w' | 'b'): string {
  const parts = fen.split(' ');
  parts[1] = side;
  parts[3] = '-'; // en passant square belongs to the other side
  return parts.join(' ');
}

export interface PendingPromotion {
  from: Square;
  to: Square;
  color: 'w' | 'b';
  premove: boolean;
}

/** Interaction state shared by the 2D and 3D renderers. */
export function useBoardLogic(p: BoardProps) {
  const autoQueen = useSettings((s) => s.gameplay.autoQueen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);
  const chess = useMemo(() => {
    try {
      return new Chess(p.fen);
    } catch {
      return new Chess();
    }
  }, [p.fen]);
  const turn = chess.turn();

  const canMoveColor = useCallback(
    (c: 'w' | 'b') => p.movable === 'both' || p.movable === c,
    [p.movable],
  );
  const myTurn = p.movable === 'both' || p.movable === turn;
  const premoveMode = !myTurn && !!p.allowPremove && p.movable !== null && p.movable !== 'both' && !chess.isGameOver();

  /** Destinations for a piece; premoves use a turn-swapped position (pseudo-legal). */
  const targetsFor = useCallback(
    (sq: Square): Move[] => {
      const piece = chess.get(sq);
      if (!piece || !canMoveColor(piece.color)) return [];
      if (piece.color === turn) return chess.moves({ square: sq, verbose: true });
      if (!premoveMode) return [];
      try {
        const c2 = new Chess(turnSwapped(p.fen, piece.color), { skipValidation: true });
        const own = c2.moves({ square: sq, verbose: true });
        // also allow pawn captures onto currently-empty squares (premove recaptures)
        if (piece.type === 'p') {
          const dir = piece.color === 'w' ? 1 : -1;
          const f = sq.charCodeAt(0);
          const r = Number(sq[1]) + dir;
          for (const df of [-1, 1]) {
            const ff = f + df;
            if (ff < 97 || ff > 104 || r < 1 || r > 8) continue;
            const to = (String.fromCharCode(ff) + r) as Square;
            if (!own.some((m) => m.to === to)) own.push({ from: sq, to, piece: 'p', color: piece.color } as Move);
          }
        }
        return own;
      } catch {
        return [];
      }
    },
    [chess, turn, canMoveColor, premoveMode, p.fen],
  );

  const targets = useMemo(() => (selected ? targetsFor(selected) : []), [selected, targetsFor]);

  // reset selection when the position changes
  const fenRef = useRef(p.fen);
  useEffect(() => {
    if (fenRef.current !== p.fen) {
      fenRef.current = p.fen;
      setSelected((s) => {
        if (!s) return null;
        const piece = chess.get(s);
        return piece && canMoveColor(piece.color) && piece.color !== turn && premoveMode ? s : null;
      });
      setPromotion(null);
    }
  }, [p.fen, chess, canMoveColor, turn, premoveMode]);

  const isPromotion = (from: Square, to: Square) => {
    const piece = chess.get(from);
    return piece?.type === 'p' && ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));
  };

  const commit = useCallback(
    (from: Square, to: Square, promo?: string): boolean => {
      const piece = chess.get(from);
      if (!piece) return false;
      const isPre = piece.color !== turn;
      if (isPromotion(from, to) && !promo) {
        if (autoQueen) promo = 'q';
        else {
          setPromotion({ from, to, color: piece.color, premove: isPre });
          return true;
        }
      }
      setSelected(null);
      if (isPre) {
        p.onPremove?.(from, to, promo);
        return true;
      }
      const legal = chess.moves({ square: from, verbose: true }).some((m) => m.to === to);
      if (!legal) {
        play('illegal');
        return false;
      }
      const r = p.onMove?.(from, to, promo);
      return r !== false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chess, turn, autoQueen, p.onMove, p.onPremove],
  );

  const choosePromotion = useCallback(
    (piece: string | null) => {
      const pr = promotion;
      setPromotion(null);
      setSelected(null);
      if (!pr || !piece) return;
      if (pr.premove) p.onPremove?.(pr.from, pr.to, piece);
      else p.onMove?.(pr.from, pr.to, piece);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [promotion, p.onMove, p.onPremove],
  );

  /** Click / tap on a square. Returns true if it consumed the click. */
  const clickSquare = useCallback(
    (sq: Square) => {
      if (p.movable === null) return;
      const piece = chess.get(sq);
      if (selected) {
        if (sq === selected) {
          setSelected(null);
          return;
        }
        if (targets.some((m) => m.to === sq)) {
          commit(selected, sq);
          return;
        }
        if (piece && canMoveColor(piece.color) && (piece.color === turn || premoveMode)) {
          setSelected(sq);
          return;
        }
        setSelected(null);
        if (p.premove) p.onPremoveCancel?.();
        return;
      }
      if (piece && canMoveColor(piece.color) && (piece.color === turn || premoveMode)) setSelected(sq);
      else if (p.premove) p.onPremoveCancel?.();
    },
    [p.movable, p.premove, p.onPremoveCancel, chess, selected, targets, commit, canMoveColor, turn, premoveMode],
  );

  const canDrag = useCallback(
    (sq: Square) => {
      if (p.movable === null) return false;
      const piece = chess.get(sq);
      return !!piece && canMoveColor(piece.color) && (piece.color === turn || premoveMode);
    },
    [p.movable, chess, canMoveColor, turn, premoveMode],
  );

  const dropOn = useCallback(
    (from: Square, to: Square | null) => {
      if (!to || to === from) return false;
      const t = targetsFor(from);
      if (!t.some((m) => m.to === to)) {
        setSelected(null);
        return false;
      }
      return commit(from, to);
    },
    [targetsFor, commit],
  );

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    return chess.findPiece({ type: 'k', color: turn })[0] ?? null;
  }, [chess, turn]);

  return { chess, selected, setSelected, targets, clickSquare, canDrag, dropOn, promotion, choosePromotion, checkSquare, premoveMode, turn };
}
