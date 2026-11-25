import { Box, Square } from 'lucide-react';
import { useSettings } from '../stores/settings';
import { detectDevice } from '../lib/device';

/** Prominent 2D / 3D board switch. Applies instantly and is remembered. */
export function ViewToggle({ compact }: { compact?: boolean }) {
  const mode = useSettings((s) => s.graphics.mode);
  const set = useSettings((s) => s.set);
  const webgl = detectDevice().webgl;
  return (
    <div className={`view-toggle ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Board view">
      {!compact && <span className="view-toggle-label">Board view</span>}
      <div className="view-toggle-track">
        <span className="view-toggle-thumb" style={{ transform: mode === '3d' ? 'translateX(100%)' : 'none' }} />
        <button role="radio" aria-checked={mode === '2d'} className={mode === '2d' ? 'on' : ''} onClick={() => set('graphics', { mode: '2d' })}>
          <Square /> 2D
        </button>
        <button role="radio" aria-checked={mode === '3d'} className={mode === '3d' ? 'on' : ''} disabled={!webgl} title={webgl ? undefined : '3D needs WebGL, which this device does not support'} onClick={() => set('graphics', { mode: '3d' })}>
          <Box /> 3D
        </button>
      </div>
    </div>
  );
}
