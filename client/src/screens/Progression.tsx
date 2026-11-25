import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Star, Award, Target, Gift, Lock, Check } from 'lucide-react';
import { COSMETIC_BY_ID, levelFromXp, type LevelReward } from '@dc/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { Progress, Points, Tabs, Loading } from '../components/ui';
import { ItemPreview } from '../components/Cosmetics';
import { fmtDate } from '../lib/format';

interface Ach { id: string; name: string; description: string; category: string; xp: number; points: number; item: string | null; current: number; target: number; unlockedAt: number | null }
interface Period { period: 'daily' | 'weekly'; key: string; resetsAt: number; challenges: { id: string; name: string; target: number; xp: number; points: number; progress: number; completed: boolean }[] }

function until(t: number) {
  const s = Math.max(0, Math.floor((t - Date.now()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : `${h}h ${m}m`;
}

function Levels() {
  const me = useSession((s) => s.me)!;
  const [levels, setLevels] = useState<LevelReward[] | null>(null);
  const cur = levelFromXp(me.xp);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api.get('/api/progression').then((r) => setLevels(r.levels)).catch(() => setLevels([]));
  }, []);
  useEffect(() => {
    ref.current?.querySelector('.cur-level')?.scrollIntoView({ block: 'center', inline: 'center' });
  }, [levels]);
  if (!levels) return <Loading />;
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="panel panel-pad row wrap between" style={{ gap: 18 }}>
        <div>
          <div className="label">Current level</div>
          <div className="display" style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1 }}>{cur.level}</div>
        </div>
        <div className="grow" style={{ minWidth: 240 }}>
          <div className="row between small"><span className="muted">Progress to level {cur.level + 1}</span><span className="mono">{cur.xpIntoLevel.toLocaleString()} / {cur.xpForNext.toLocaleString()} XP</span></div>
          <Progress value={cur.progress} className="lg" />
          <div className="tiny muted" style={{ marginTop: 6 }}>Total XP {me.xp.toLocaleString()}. Earn XP by completing games (more for wins, ranked and new opponents), challenges and achievements.</div>
        </div>
      </div>
      <div ref={ref} style={{ overflowX: 'auto', paddingBottom: 10 }}>
        <div className="row" style={{ gap: 10, width: 'max-content', alignItems: 'stretch' }}>
          {levels.map((l) => {
            const reached = cur.level >= l.level;
            const isCur = cur.level + 1 === l.level;
            return (
              <div key={l.level} className={`panel ${isCur ? 'cur-level' : ''}`} style={{ width: l.milestone ? 170 : 120, padding: 12, display: 'flex', flexDirection: 'column', borderColor: isCur ? 'var(--accent)' : l.milestone ? 'rgba(255,178,46,0.4)' : undefined, opacity: reached ? 0.75 : 1 }}>
                <div className="row between">
                  <span className="display" style={{ fontWeight: 700, fontSize: '1.2rem', color: l.milestone ? 'var(--gold)' : undefined }}>{l.level}</span>
                  {reached ? <Check size={16} style={{ color: 'var(--good)' }} /> : <Lock size={14} className="muted" />}
                </div>
                <div className="tiny muted" style={{ marginTop: 4 }}>{l.milestone ? 'Milestone' : 'Level reward'}</div>
                <div style={{ marginTop: 6 }}><Points value={l.points} size={13} /></div>
                {l.items.map((i) => COSMETIC_BY_ID[i] && (
                  <div key={i} className="inset" style={{ marginTop: 8, height: 72, display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden' }}>
                    <ItemPreview item={COSMETIC_BY_ID[i]} />
                  </div>
                ))}
                {l.items.map((i) => <div key={i + 'n'} className="tiny" style={{ color: 'var(--gold)', fontWeight: 700 }}>{COSMETIC_BY_ID[i]?.name}</div>)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Achievements() {
  const [list, setList] = useState<Ach[] | null>(null);
  useEffect(() => {
    api.get('/api/achievements').then((r) => setList(r.achievements)).catch(() => setList([]));
  }, []);
  if (!list) return <Loading />;
  const done = list.filter((a) => a.unlockedAt).length;
  const cats = [...new Set(list.map((a) => a.category))];
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="small muted">{done} of {list.length} unlocked</div>
      {cats.map((c) => (
        <div key={c}>
          <div className="label" style={{ marginBottom: 10 }}>{c}</div>
          <div className="auto-grid" style={{ ['--min' as any]: '260px' }}>
            {list.filter((a) => a.category === c).map((a) => (
              <div key={a.id} className="panel panel-pad col" style={{ gap: 8, borderColor: a.unlockedAt ? 'rgba(63,207,142,0.4)' : undefined }}>
                <div className="row between">
                  <div className="row">
                    <Award size={20} style={{ color: a.unlockedAt ? 'var(--gold)' : 'var(--text-3)' }} />
                    <span style={{ fontWeight: 700 }}>{a.name}</span>
                  </div>
                  {a.unlockedAt && <span className="tiny" style={{ color: 'var(--good)' }}>{fmtDate(a.unlockedAt)}</span>}
                </div>
                <div className="small dim">{a.description}</div>
                <Progress value={a.current / a.target} color={a.unlockedAt ? 'var(--good)' : undefined} />
                <div className="row between tiny">
                  <span className="mono muted">{a.current.toLocaleString()} / {a.target.toLocaleString()}</span>
                  <span className="row" style={{ gap: 8 }}>
                    {a.xp > 0 && <span style={{ color: 'var(--accent)' }}>+{a.xp} XP</span>}
                    <Points value={a.points} size={12} />
                    {a.item && <span className="row" style={{ gap: 3, color: 'var(--gold)' }}><Gift size={12} />{COSMETIC_BY_ID[a.item]?.name}</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Challenges() {
  const [periods, setPeriods] = useState<Period[] | null>(null);
  useEffect(() => {
    api.get('/api/challenges').then((r) => setPeriods(r.periods)).catch(() => setPeriods([]));
  }, []);
  if (!periods) return <Loading />;
  return (
    <div className="grid g2">
      {periods.map((p) => (
        <div key={p.key} className="panel">
          <div className="panel-head">
            <h3 className="panel-title"><Target /> {p.period === 'daily' ? 'Daily challenges' : 'Weekly challenges'}</h3>
            <span className="tiny muted">Resets in {until(p.resetsAt)}</span>
          </div>
          <div className="panel-body col" style={{ gap: 16 }}>
            {p.challenges.map((c) => (
              <div key={c.id}>
                <div className="row between">
                  <span style={{ fontWeight: 600, color: c.completed ? 'var(--good)' : undefined }}>{c.completed && <Check size={14} style={{ verticalAlign: -2 }} />} {c.name}</span>
                  <span className="row tiny" style={{ gap: 8 }}><span style={{ color: 'var(--accent)' }}>+{c.xp} XP</span><Points value={c.points} size={12} /></span>
                </div>
                <Progress value={c.progress / c.target} color={c.completed ? 'var(--good)' : undefined} />
                <div className="tiny muted mono" style={{ marginTop: 3 }}>{Math.min(c.progress, c.target)} / {c.target}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="tiny muted">Challenges rotate automatically and only count games that award rewards (8+ moves).</div>
    </div>
  );
}

export default function Progression() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'levels' | 'achievements' | 'challenges') || 'levels';
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Progression</h1>
          <p className="page-sub">Your journey: levels, achievements and rotating challenges.</p>
        </div>
      </div>
      <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={[{ id: 'levels', label: 'Levels', icon: <Star /> }, { id: 'achievements', label: 'Achievements', icon: <Award /> }, { id: 'challenges', label: 'Challenges', icon: <Target /> }]} />
      {tab === 'levels' ? <Levels /> : tab === 'achievements' ? <Achievements /> : <Challenges />}
    </div>
  );
}
