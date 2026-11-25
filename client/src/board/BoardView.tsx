import { lazy, Suspense, memo } from 'react';
import type { BoardProps } from './types';
import { Board2D } from './Board2D';
import { useSettings } from '../stores/settings';

const Board3D = lazy(() => import('./Board3D'));

/** Picks the renderer. 2D never touches three.js; 3D is a separate lazily loaded chunk. */
export const BoardView = memo(function BoardView(props: BoardProps) {
  const mode = useSettings((s) => s.graphics.mode);
  const m = props.mode ?? mode;
  if (m === '3d') {
    return (
      <Suspense fallback={<div className="board3d"><div className="board3d-loading"><div className="spinner" /></div></div>}>
        <Board3D {...props} />
      </Suspense>
    );
  }
  return <Board2D {...props} />;
});
