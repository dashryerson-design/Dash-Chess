import { Component, lazy, Suspense, memo, type ReactNode } from 'react';
import type { BoardProps } from './types';
import { Board2D } from './Board2D';
import { useSettings } from '../stores/settings';

export const loadBoard3D = () => import('./Board3D');
const Board3D = lazy(loadBoard3D);

/** If the 3D renderer can't load (offline, site updated, no WebGL), fall back to the 2D board instead of a blank screen. */
class Fallback2D extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Picks the renderer. 2D never touches three.js; 3D is a separate lazily loaded chunk. */
export const BoardView = memo(function BoardView(props: BoardProps) {
  const mode = useSettings((s) => s.graphics.mode);
  const m = props.mode ?? mode;
  if (m === '3d') {
    return (
      <Fallback2D fallback={<Board2D {...props} />}>
        <Suspense fallback={<div className="board3d"><div className="board3d-loading"><div className="spinner" /></div></div>}>
          <Board3D {...props} />
        </Suspense>
      </Fallback2D>
    );
  }
  return <Board2D {...props} />;
});
