import { useEffect, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import type { BoardProps } from './types';
import { useBoardLogic } from './logic';
import { useSettings } from '../stores/settings';
import { useSession } from '../stores/session';
import { HIGHLIGHTS } from '../cosmetics/boards';
import { PromotionPicker } from './PromotionPicker';
import type { ChessScene } from './three/scene';
import { Camera, Eye, MoveDiagonal, ArrowDownToLine } from 'lucide-react';
import './board.css';

/** 3D board. three.js is loaded lazily via dynamic import (separate chunk). */
export default function Board3D(props: BoardProps) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ChessScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const gfx = useSettings((s) => s.graphics);
  const gp = useSettings((s) => s.gameplay);
  const equipped = useSession((s) => s.me?.equipped);
  const logic = useBoardLogic(props);
  const logicRef = useRef(logic);
  logicRef.current = logic;
  const [hover, setHover] = useState<Square | null>(null);
  const animMs = gfx.animations === 'off' ? 0 : Math.round((gfx.animations === 'reduced' ? 160 : 320) / gfx.animationSpeed);

  const pieceSet = props.pieceSet ?? equipped?.pieces ?? 'pieces.classic';
  const board = props.boardId ?? equipped?.board ?? 'board.wood';
  const environment = props.environmentId ?? equipped?.background ?? 'background.void';
  const captureFx = (equipped?.captureEffect ?? 'captureEffect.fade').split('.')[1];
  const moveFx = (equipped?.moveEffect ?? 'moveEffect.none').split('.')[1];

  // create scene (re-create when quality-level options change)
  useEffect(() => {
    let disposed = false;
    let scene: ChessScene | null = null;
    import('./three/scene')
      .then(({ ChessScene }) => {
        if (disposed || !host.current) return;
        try {
          scene = new ChessScene(host.current, {
            quality: gfx.quality,
            shadows: gfx.shadows,
            lighting: gfx.lighting,
            reflections: gfx.reflections,
            effects: gfx.effects,
            cameraSensitivity: gfx.cameraSensitivity,
            cinematic: gfx.cinematic,
            animationMs: animMs,
          });
        } catch (e) {
          setFailed((e as Error).message || 'WebGL unavailable');
          return;
        }
        sceneRef.current = scene;
        (window as any).__dcScene = scene; // lets automated tests project squares to screen coordinates
        scene.onSquareDown = (sq) => {
          const l = logicRef.current;
          return gp.moveInput !== 'click' && l.canDrag(sq);
        };
        scene.onSquareUp = (from, to, wasDrag) => {
          const l = logicRef.current;
          if (wasDrag) {
            if (from) l.dropOn(from, to);
          } else if (to) l.clickSquare(to);
        };
        scene.onHover = setHover;
        setReady(true);
      })
      .catch((e) => setFailed(String(e)));
    return () => {
      disposed = true;
      scene?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gfx.quality, gfx.shadows, gfx.lighting, gfx.reflections]);

  useEffect(() => {
    sceneRef.current?.setOptions({ effects: gfx.effects, cameraSensitivity: gfx.cameraSensitivity, cinematic: gfx.cinematic, animationMs: animMs });
  }, [ready, gfx.effects, gfx.cameraSensitivity, gfx.cinematic, animMs]);

  useEffect(() => {
    sceneRef.current?.setCosmetics({ pieceSet, board, environment });
  }, [ready, pieceSet, board, environment]);

  const prevFen = useRef<string | null>(null);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setPosition(props.fen, prevFen.current !== null);
    prevFen.current = props.fen;
  }, [ready, props.fen]);

  const firstOrientation = useRef(true);
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.setOrientation(props.orientation, firstOrientation.current);
    firstOrientation.current = false;
  }, [ready, props.orientation]);

  // effects
  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !props.lastMove || props.moveKey === undefined) return;
    if (gp.moveEffects && moveFx !== 'none') s.effect(moveFx, props.lastMove[1], '#7fb2ff');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.moveKey]);
  const prevCount = useRef<number | null>(null);
  useEffect(() => {
    const count = props.fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
    if (prevCount.current !== null && count < prevCount.current && props.lastMove && gp.captureAnimation && captureFx !== 'fade') sceneRef.current?.effect(captureFx, props.lastMove[1]);
    prevCount.current = count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen]);

  // highlights
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const colors = HIGHLIGHTS[gp.highlightColor] ?? HIGHLIGHTS.gold;
    s.setHighlights({
      lastMove: gp.highlightLastMove ? props.lastMove ?? null : null,
      selected: logic.selected,
      targets: logic.targets.map((m) => ({ to: m.to, capture: !!logic.chess.get(m.to) || !!m.flags?.includes('e') })),
      check: logic.checkSquare,
      premove: props.premove ?? null,
      hover,
      arrows: [...(props.arrows ?? []), ...(props.hint ? [{ from: props.hint[0], to: props.hint[1], color: 'rgba(63, 207, 142, 0.85)' }] : []), ...(props.ghost ? [{ from: props.ghost.from, to: props.ghost.to, color: 'rgba(60, 255, 140, 0.8)' }] : [])],
      colors: { ...colors, legal: colors.legal.replace(/0\.\d+\)$/, '0.45)') },
      legalStyle: gp.legalStyle,
      showLegal: gp.legalMoves,
      checkEffect: gp.checkEffect ? equipped?.checkEffect ?? 'checkEffect.glow' : null,
      markers: [...(props.markers ?? []).map((m) => ({ square: m.square, color: m.color })), ...(props.ghost ? [{ square: props.ghost.to, color: 'rgba(40, 255, 120, 0.55)' }] : [])],
    });
  }, [ready, logic.selected, logic.targets, logic.checkSquare, logic.chess, props.lastMove, props.premove, props.arrows, props.hint, props.ghost, props.markers, hover, gp, equipped?.checkEffect]);

  if (failed) {
    return (
      <div className="board3d-fail empty">
        <div className="t">3D mode is unavailable on this device</div>
        <div className="small">{failed}. Switch to 2D in Settings.</div>
      </div>
    );
  }

  return (
    <div className="board3d">
      <div ref={host} className="board3d-host" />
      {!ready && (
        <div className="board3d-loading">
          <div className="spinner" />
        </div>
      )}
      {ready && !props.compact && (
        <div className="cam-controls">
          <button className="icon-btn sm" title="Player view" onClick={() => sceneRef.current?.setView('player')}><Camera /></button>
          <button className="icon-btn sm" title="Top-down view" onClick={() => sceneRef.current?.setView('top')}><ArrowDownToLine /></button>
          <button className="icon-btn sm" title="Side view" onClick={() => sceneRef.current?.setView('side')}><MoveDiagonal /></button>
          <button className="icon-btn sm" title="Low cinematic view" onClick={() => sceneRef.current?.setView('low')}><Eye /></button>
        </div>
      )}
      {logic.promotion && (
        <div className="board3d-promo">
          <PromotionPicker color={logic.promotion.color} square={(logic.promotion.to[0] + (logic.promotion.color === 'w' ? '8' : '1'))} orientation={'w'} pieceSet={pieceSet} onPick={logic.choosePromotion} />
        </div>
      )}
    </div>
  );
}
