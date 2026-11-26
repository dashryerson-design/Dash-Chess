import { useState } from 'react';
import { Monitor, Gamepad2, Volume2, LayoutGrid, User, Wand2, LogOut } from 'lucide-react';
import { useSettings, recommended } from '../stores/settings';
import { useSession } from '../stores/session';
import { Seg, Switch, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { toast, toastError } from '../stores/toasts';
import { play } from '../lib/sound';
import { fmtDate } from '../lib/format';
import { isAdmin, lockAdmin, unlockAdmin } from '../lib/admin';

type Tab = 'graphics' | 'gameplay' | 'audio' | 'interface' | 'account';

function Row({ t, d, children }: { t: string; d?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div style={{ minWidth: 0 }}>
        <div className="t">{t}</div>
        {d && <div className="d">{d}</div>}
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  );
}

function Slider({ value, onChange, min = 0, max = 1, step = 0.05, fmt = (v: number) => `${Math.round(v * 100)}%` }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; fmt?: (v: number) => string }) {
  return (
    <div className="row" style={{ width: 220 }}>
      <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono small" style={{ width: 48, textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  );
}

function Account() {
  const { me, refresh, logout } = useSession();
  const [username, setUsername] = useState(me?.username ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  if (!me) return null;
  const save = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast({ kind: 'success', title: msg });
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="panel panel-pad">
        <h3 className="panel-title" style={{ marginBottom: 8 }}>Account information</h3>
        <Row t="Player ID"><span className="mono small">{me.id}</span></Row>
        <Row t="Created"><span className="small">{fmtDate(me.createdAt)}</span></Row>
        <Row t="Username" d="Can be changed once every 30 days.">
          <div className="row">
            <input className="input" style={{ width: 180 }} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} />
            <button className="btn" disabled={username === me.username} onClick={() => save(() => api.post('/api/me/username', { username }), 'Username updated')}>Save</button>
          </div>
        </Row>
      </div>
      <div className="panel panel-pad">
        <h3 className="panel-title" style={{ marginBottom: 8 }}>Password</h3>
        <div className="grid g2" style={{ gap: 10 }}>
          <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className="input" type="password" placeholder="New password (8+ characters)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <button className="btn" style={{ marginTop: 10 }} disabled={!pw.current || pw.next.length < 8} onClick={() => save(async () => { await api.post('/api/me/password', pw); setPw({ current: '', next: '' }); }, 'Password changed. Other sessions were signed out.')}>Change password</button>
      </div>
      <div className="panel panel-pad">
        <h3 className="panel-title" style={{ marginBottom: 8 }}>Privacy</h3>
        <Row t="Show online status" d="When off, friends always see you as offline.">
          <Switch checked={me.privacy.showOnline} onChange={(v) => save(() => api.patch('/api/me/privacy', { showOnline: v }), 'Privacy updated')} />
        </Row>
        <Row t="Who can challenge you">
          <Seg options={[{ value: 'everyone', label: 'Everyone' }, { value: 'friends', label: 'Friends' }, { value: 'nobody', label: 'Nobody' }]} value={me.privacy.allowChallenges} onChange={(v) => save(() => api.patch('/api/me/privacy', { allowChallenges: v }), 'Privacy updated')} />
        </Row>
      </div>
      <AdminPanel />
      <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => void logout()}><LogOut /> Log out</button>
    </div>
  );
}

function AdminPanel() {
  const [admin, setAdmin] = useState(isAdmin());
  const [pass, setPass] = useState('');
  return (
    <div className="panel panel-pad">
      <h3 className="panel-title" style={{ marginBottom: 8 }}>Admin</h3>
      {admin ? (
        <Row t="Admin tools unlocked on this device" d="Testing tools are available in matches.">
          <button className="btn btn-sm" onClick={() => { lockAdmin(); setAdmin(false); }}>Lock</button>
        </Row>
      ) : (
        <div className="row">
          <input className="input" type="password" placeholder="Admin passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
          <button className="btn" onClick={async () => { if (await unlockAdmin(pass)) { setAdmin(true); setPass(''); toast({ kind: 'success', title: 'Admin tools unlocked' }); } else toast({ kind: 'error', title: 'Wrong passphrase' }); }}>Unlock</button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState<Tab>('graphics');
  const s = useSettings();
  const rec = recommended();

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Saved on this device and synced to your account.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => { s.reset(); toast({ kind: 'info', title: 'Settings reset to defaults' }); }}>Reset all</button>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'graphics', label: 'Graphics', icon: <Monitor /> },
          { id: 'gameplay', label: 'Gameplay', icon: <Gamepad2 /> },
          { id: 'audio', label: 'Audio', icon: <Volume2 /> },
          { id: 'interface', label: 'Interface', icon: <LayoutGrid /> },
          { id: 'account', label: 'Account', icon: <User /> },
        ]}
      />
      {tab === 'graphics' && (
        <div className="col" style={{ gap: 18 }}>
          {rec && (
            <div className="panel panel-pad row between wrap" style={{ gap: 12 }}>
              <div>
                <div className="t" style={{ fontWeight: 700 }}>Recommended for this device: {rec.mode.toUpperCase()} · {rec.quality} quality{rec.shadows ? ' · shadows' : ''}</div>
                <div className="tiny muted">Detected {rec.device.cores} cores{rec.device.memory ? `, ${rec.device.memory} GB memory` : ''}, {rec.device.webgl ? 'WebGL available' : 'no WebGL'}{rec.device.mobile ? ', touch device' : ''}.</div>
              </div>
              <button className="btn" onClick={() => { s.set('graphics', { mode: rec.mode, quality: rec.quality, shadows: rec.shadows, reflections: rec.quality === 'high' }); toast({ kind: 'success', title: 'Recommended settings applied' }); }}><Wand2 /> Apply</button>
            </div>
          )}
          <div className="panel panel-pad">
            <Row t="Board renderer" d="2D is a lightweight SVG renderer that never loads 3D resources. 3D uses WebGL.">
              <Seg options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D', disabled: rec ? !rec.device.webgl : false }]} value={s.graphics.mode} onChange={(v) => s.set('graphics', { mode: v as '2d' | '3d' })} />
            </Row>
            <Row t="3D quality" d="Resolution, geometry detail, antialiasing and materials.">
              <Seg options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} value={s.graphics.quality} onChange={(v) => s.set('graphics', { quality: v as 'low' })} />
            </Row>
            <Row t="Shadows" d="Real-time shadow mapping in 3D."><Switch checked={s.graphics.shadows} onChange={(v) => s.set('graphics', { shadows: v })} /></Row>
            <Row t="Reflections" d="Environment reflections for metallic and glossy pieces."><Switch checked={s.graphics.reflections} onChange={(v) => s.set('graphics', { reflections: v })} /></Row>
            <Row t="Lighting">
              <Seg options={[{ value: 'studio', label: 'Studio' }, { value: 'dramatic', label: 'Dramatic' }, { value: 'soft', label: 'Soft' }]} value={s.graphics.lighting} onChange={(v) => s.set('graphics', { lighting: v as 'studio' })} />
            </Row>
            <Row t="Visual effects" d="Move, capture and particle effects."><Switch checked={s.graphics.effects} onChange={(v) => s.set('graphics', { effects: v })} /></Row>
            <Row t="Animations">
              <Seg options={[{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }, { value: 'off', label: 'Off' }]} value={s.graphics.animations} onChange={(v) => s.set('graphics', { animations: v as 'full' })} />
            </Row>
            <Row t="Animation speed"><Slider value={s.graphics.animationSpeed} min={0.5} max={2} step={0.1} fmt={(v) => `${v.toFixed(1)}x`} onChange={(v) => s.set('graphics', { animationSpeed: v })} /></Row>
            <Row t="Camera sensitivity" d="3D rotate and zoom speed."><Slider value={s.graphics.cameraSensitivity} min={0.2} max={2} step={0.1} fmt={(v) => `${v.toFixed(1)}x`} onChange={(v) => s.set('graphics', { cameraSensitivity: v })} /></Row>
            <Row t="Cinematic camera" d="Slow orbit when idle in 3D."><Switch checked={s.graphics.cinematic} onChange={(v) => s.set('graphics', { cinematic: v })} /></Row>
          </div>
        </div>
      )}
      {tab === 'gameplay' && (
        <div className="panel panel-pad">
          <Row t="Legal move indicators"><Switch checked={s.gameplay.legalMoves} onChange={(v) => s.set('gameplay', { legalMoves: v })} /></Row>
          <Row t="Indicator style"><Seg options={[{ value: 'dots', label: 'Dots' }, { value: 'rings', label: 'Rings' }, { value: 'squares', label: 'Squares' }]} value={s.gameplay.legalStyle} onChange={(v) => s.set('gameplay', { legalStyle: v as 'dots' })} /></Row>
          <Row t="Board coordinates"><Seg options={[{ value: 'inside', label: 'Show' }, { value: 'off', label: 'Hide' }]} value={s.gameplay.coordinates} onChange={(v) => s.set('gameplay', { coordinates: v as 'inside' })} /></Row>
          <Row t="Highlight last move"><Switch checked={s.gameplay.highlightLastMove} onChange={(v) => s.set('gameplay', { highlightLastMove: v })} /></Row>
          <Row t="Highlight colour">
            <Seg options={(['gold', 'blue', 'green', 'purple', 'red'] as const).map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} value={s.gameplay.highlightColor} onChange={(v) => s.set('gameplay', { highlightColor: v })} />
          </Row>
          <Row t="Premoves" d="Queue a move during your opponent's turn."><Switch checked={s.gameplay.premoves} onChange={(v) => s.set('gameplay', { premoves: v })} /></Row>
          <Row t="Always promote to queen"><Switch checked={s.gameplay.autoQueen} onChange={(v) => s.set('gameplay', { autoQueen: v })} /></Row>
          <Row t="Move input"><Seg options={[{ value: 'both', label: 'Click & drag' }, { value: 'click', label: 'Click' }, { value: 'drag', label: 'Drag' }]} value={s.gameplay.moveInput} onChange={(v) => s.set('gameplay', { moveInput: v as 'both' })} /></Row>
          <Row t="Board orientation"><Seg options={[{ value: 'auto', label: 'My colour' }, { value: 'white', label: 'White' }, { value: 'black', label: 'Black' }]} value={s.gameplay.orientation} onChange={(v) => s.set('gameplay', { orientation: v as 'auto' })} /></Row>
          <Row t="Live move ratings" d="Show classifications as you play, when the game allows it."><Switch checked={s.gameplay.liveRatings} onChange={(v) => s.set('gameplay', { liveRatings: v })} /></Row>
          <Row t="Move effects"><Switch checked={s.gameplay.moveEffects} onChange={(v) => s.set('gameplay', { moveEffects: v })} /></Row>
          <Row t="Capture animations"><Switch checked={s.gameplay.captureAnimation} onChange={(v) => s.set('gameplay', { captureAnimation: v })} /></Row>
          <Row t="Check effects"><Switch checked={s.gameplay.checkEffect} onChange={(v) => s.set('gameplay', { checkEffect: v })} /></Row>
          <Row t="Confirm resignation"><Switch checked={s.gameplay.confirmResign} onChange={(v) => s.set('gameplay', { confirmResign: v })} /></Row>
        </div>
      )}
      {tab === 'audio' && (
        <div className="panel panel-pad">
          <Row t="Master volume"><Slider value={s.audio.master} onChange={(v) => s.set('audio', { master: v })} /></Row>
          <Row t="Sound effects"><Slider value={s.audio.sfx} onChange={(v) => s.set('audio', { sfx: v })} /></Row>
          <Row t="Music" d="Generative ambient soundtrack."><Slider value={s.audio.music} onChange={(v) => s.set('audio', { music: v })} /></Row>
          <Row t="Move sounds"><Switch checked={s.audio.moveSounds} onChange={(v) => s.set('audio', { moveSounds: v })} /></Row>
          <Row t="Capture sounds"><Switch checked={s.audio.captureSounds} onChange={(v) => s.set('audio', { captureSounds: v })} /></Row>
          <Row t="Notification sounds"><Switch checked={s.audio.notificationSounds} onChange={(v) => s.set('audio', { notificationSounds: v })} /></Row>
          <Row t="Test"><div className="row"><button className="btn btn-sm" onClick={() => play('move')}>Move</button><button className="btn btn-sm" onClick={() => play('capture')}>Capture</button><button className="btn btn-sm" onClick={() => play('incredible')}>Incredible</button></div></Row>
        </div>
      )}
      {tab === 'interface' && (
        <div className="panel panel-pad">
          <Row t="UI scale"><Slider value={s.ui.scale} min={0.85} max={1.2} step={0.05} onChange={(v) => s.set('ui', { scale: v })} /></Row>
          <Row t="Reduce motion" d="Disables interface animations."><Switch checked={s.ui.reduceMotion} onChange={(v) => s.set('ui', { reduceMotion: v })} /></Row>
          <Row t="Pop-up notifications"><Switch checked={s.ui.toasts} onChange={(v) => s.set('ui', { toasts: v })} /></Row>
          <Row t="Friend activity alerts"><Switch checked={s.ui.friendAlerts} onChange={(v) => s.set('ui', { friendAlerts: v })} /></Row>
          <Row t="Challenge alerts"><Switch checked={s.ui.challengeAlerts} onChange={(v) => s.set('ui', { challengeAlerts: v })} /></Row>
        </div>
      )}
      {tab === 'account' && <Account />}
    </div>
  );
}
