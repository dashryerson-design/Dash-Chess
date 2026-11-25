import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ShoppingBag, RotateCcw } from 'lucide-react';
import { COSMETICS, COSMETIC_TYPES, DEFAULT_EQUIPPED, unlockLabel, type CosmeticType } from '@dc/shared';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import { toast, toastError } from '../stores/toasts';
import { ItemCard, ItemStage } from '../components/Cosmetics';
import { RarityTag, Seg, Tabs } from '../components/ui';
import { useSettings } from '../stores/settings';

export default function Customise() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const [type, setType] = useState<CosmeticType>('pieces');
  const [show, setShow] = useState<'all' | 'owned'>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const gfx = useSettings((s) => s.graphics);
  const setSettings = useSettings((s) => s.set);
  const owned = useMemo(() => new Set(me?.inventory ?? []), [me?.inventory]);
  const items = COSMETICS.filter((c) => c.type === type && (show === 'all' || owned.has(c.id)));
  const sel = COSMETICS.find((c) => c.id === selId) ?? COSMETICS.find((c) => c.id === me?.equipped[type]) ?? items[0];

  useEffect(() => setSelId(null), [type]);
  if (!me) return null;

  const equip = async (itemId: string | null) => {
    try {
      await api.post('/api/me/equip', { type, itemId });
      await refresh();
      toast({ kind: 'success', title: itemId ? 'Equipped' : 'Reset to default' });
    } catch (e) {
      toastError(e);
    }
  };

  const isOwned = sel && (owned.has(sel.id) || sel.unlock.kind === 'default');
  const isEquipped = sel && me.equipped[type] === sel.id;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Customisation</h1>
          <p className="page-sub">Your cosmetics are personal: you always see your own board and pieces, and your opponent sees theirs.</p>
        </div>
        <div className="row">
          <Seg options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]} value={gfx.mode} onChange={(m) => setSettings('graphics', { mode: m as '2d' | '3d' })} />
          <button className="btn" onClick={() => navigate('/shop')}><ShoppingBag /> Shop</button>
        </div>
      </div>
      <Tabs
        value={type}
        onChange={setType}
        tabs={COSMETIC_TYPES.map((t) => ({ id: t.type, label: t.plural, count: COSMETICS.filter((c) => c.type === t.type && (owned.has(c.id) || c.unlock.kind === 'default')).length }))}
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(300px,1fr)', gap: 18, alignItems: 'start' }}>
        <div>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="small muted">{items.length} items</span>
            <Seg options={[{ value: 'all', label: 'All' }, { value: 'owned', label: 'Owned' }]} value={show} onChange={(v) => setShow(v as 'all' | 'owned')} />
          </div>
          <div className="auto-grid" style={{ ['--min' as any]: '170px' }}>
            {items.map((c) => (
              <ItemCard key={c.id} item={c} owned={owned.has(c.id) || c.unlock.kind === 'default'} equipped={me.equipped[type] === c.id} selected={sel?.id === c.id} onClick={() => setSelId(c.id)} />
            ))}
          </div>
        </div>
        {sel && (
          <div className="panel panel-pad col" style={{ gap: 14, position: 'sticky', top: 0 }}>
            <ItemStage item={sel} />
            <div>
              <div className="row between">
                <span className="display" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{sel.name}</span>
                <RarityTag rarity={sel.rarity} />
              </div>
              <p className="dim small" style={{ margin: '6px 0 0' }}>{sel.description}</p>
            </div>
            {isOwned ? (
              <div className="row">
                <button className="btn btn-primary grow" disabled={!!isEquipped} onClick={() => equip(sel.id)}><Check /> {isEquipped ? 'Equipped' : 'Equip'}</button>
                {isEquipped && sel.id !== DEFAULT_EQUIPPED[type] && <button className="btn" onClick={() => equip(null)}><RotateCcw /> Unequip</button>}
              </div>
            ) : sel.unlock.kind === 'shop' ? (
              <button className="btn btn-primary" onClick={() => navigate(`/shop?item=${sel.id}`)}><ShoppingBag /> Get in shop · {unlockLabel(sel.unlock)}</button>
            ) : (
              <div className="inset small" style={{ padding: 10 }}>Locked. {unlockLabel(sel.unlock)}.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
