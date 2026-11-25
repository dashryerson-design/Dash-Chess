import { useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { BrandMark } from '../components/Shell';
import { Board2D } from '../board/Board2D';
import { Bot, Swords, Trophy, Sparkles } from 'lucide-react';

const DEMO_FEN = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 9';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useSession((s) => s.load);

  const P2P = import.meta.env.VITE_P2P === '1';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (P2P) {
      // serverless build: the profile lives in this browser, so a username is all that is needed
      setBusy(true);
      try {
        try {
          await api.post('/api/auth/register', { username: username.trim(), password: 'local-profile' });
        } catch (err) {
          if ((err as { status?: number }).status !== 409) throw err;
          await api.post('/api/auth/login', { username: username.trim(), password: 'local-profile' });
        }
        await load();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === 'register' && password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post(`/api/auth/${mode}`, { username: username.trim(), password });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-art">
        <div style={{ position: 'absolute', right: '-8%', top: '6%', width: '62%', transform: 'perspective(1200px) rotateX(42deg) rotateZ(-24deg)', opacity: 0.9, filter: 'drop-shadow(0 40px 60px rgba(0,0,0,0.6))' }}>
          <Board2D fen={DEMO_FEN} orientation="w" movable={null} pieceSet="pieces.metallic" boardId="board.future" showCoordinates={false} />
        </div>
        <div style={{ position: 'relative', maxWidth: 520 }}>
          <div className="row" style={{ marginBottom: 18 }}>
            <BrandMark size={48} />
            <div>
              <div className="brand-name" style={{ fontSize: '1.6rem' }}>DC CHESS</div>
              <div className="brand-sub">DASH CHESS</div>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: '2.6rem', lineHeight: 1.05, margin: '0 0 14px' }}>
            Every move <span className="grad-text">counts.</span>
          </h1>
          <p className="dim" style={{ fontSize: '1.02rem', marginBottom: 24 }}>
            Competitive chess with ranked divisions, twenty engine-powered opponents, live move ratings and a board that is entirely yours, in 2D or 3D.
          </p>
          <div className="grid g2" style={{ gap: 10 }}>
            {[
              [<Swords key="a" />, 'Ranked & casual online play'],
              [<Bot key="b" />, '20 bots with real personalities'],
              [<Sparkles key="c" />, 'Engine move ratings, every move'],
              [<Trophy key="d" />, 'Divisions from Bronze to DC Elite'],
            ].map(([i, t], k) => (
              <div key={k} className="row small dim" style={{ gap: 10 }}>
                <span style={{ color: 'var(--accent)', display: 'flex' }}>{i}</span>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="auth-form">
        <form className="auth-box" onSubmit={submit}>
          <div className="show-mobile row" style={{ justifyContent: 'center', marginBottom: 8 }}>
            <BrandMark size={44} />
            <div className="brand-name" style={{ fontSize: '1.4rem' }}>DC CHESS</div>
          </div>
          <div>
            <h2 className="display" style={{ margin: 0, fontSize: '1.6rem' }}>{P2P ? 'Create your account' : mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              {mode === 'register' ? 'Free forever. Your progress is saved to your account.' : 'Log in to continue your climb.'}
            </p>
          </div>
          {P2P ? (
            <div className="field">
              <label htmlFor="u">Choose a username</label>
              <input id="u" className="input" autoComplete="nickname" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3-16 letters, numbers or _" required minLength={3} maxLength={16} />
            </div>
          ) : (
            <>
          <div className="btn-group" style={{ alignSelf: 'flex-start' }}>
            <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Sign up</button>
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button>
          </div>
          <div className="field">
            <label htmlFor="u">Username</label>
            <input id="u" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3-16 letters, numbers or _" required minLength={3} maxLength={16} />
          </div>
          <div className="field">
            <label htmlFor="p">Password</label>
            <input id="p" className="input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={mode === 'register' ? 8 : 1} />
          </div>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="c">Confirm password</label>
              <input id="c" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
          )}
            </>
          )}
          {error && <div className="error-text" role="alert">{error}</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <span className="spinner" style={{ width: 18, height: 18 }} /> : P2P ? 'Play now' : mode === 'register' ? 'Create account' : 'Log in'}
          </button>
          <p className="tiny muted" style={{ textAlign: 'center' }}>
            {P2P
              ? 'No account or server needed. Your profile and progress are saved in this browser. Online games connect you directly to other players.'
              : 'No email required. Passwords are hashed with scrypt and never stored in plain text.'}
          </p>
        </form>
      </div>
    </div>
  );
}
