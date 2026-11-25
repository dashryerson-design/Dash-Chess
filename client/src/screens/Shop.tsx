import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, Check, Palette } from 'lucide-react';
import { COSMETICS, COSMETIC_BY_ID, COSMETIC_TYPES, RARITIES, type CosmeticType, type Rarity } from '@dc/shared';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import { toast, toastError } from '../stores/toasts';
import { ItemCard, ItemStage } from '../components/Cosmetics';
import { Confirm, Points, RarityTag, Seg } from '../components/ui';
import { play } from '../lib/sound';

export default function Shop() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = params.get('item');
  const [type, setType] = useState<CosmeticType | 'all'>(initial ? COSMETIC_BY_ID[initial]?.type ?? 'all' : 'all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [hideOwned, setHideOwned] = useState(false);
  const [selId, setSelId] = useState<string | null>(initial);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const owned = useMemo(() => new Set(me?.inventory ?? []), [me?.inventory]);
  if (!me) return null;

  const items = COSMETICS.filter((c) => c.unlock.kind === 'shop' && (type === 'all' || c.type === type) && (rarity === 'all' || c.rarity === rarity) && (!hideOwned || !owned.has(c.id))).sort(
    (a, b) => (a.unlock.kind === 'shop' && b.unlock.kind === 'shop' ? a.unlock.price - b.unlock.price : 0),
  );
  const sel = (selId && COSMETIC_BY_ID[selId]) || items[0];
  const price = sel && sel.unlock.kind === 'shop' ? sel.unlock.price : 0;
  const has = sel && owned.has(sel.id);
  const afford = me.points >= price;

  const buy = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      await api.post('/api/shop/buy', { itemId: sel!.id });
      play('levelup');
      await refresh();
      toast({ kind: 'reward', title: `${sel!.name} unlocked`, body: 'Equip it now or later from Customisation.', action: { label: 'Equip now', run: async () => { await api.post('/api/me/equip', { type: sel!.type, itemId: sel!.id }); await refresh(); } } }, 7000);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Shop</h1>
          <p className="page-sub">Spend DC Points earned through good moves, wins, achievements and challenges. No real money, ever.</p>
        </div>
        <div className="chip-stat" style={{ fontSize: '1rem', padding: '8px 14px' }}><Points value={me.points} size={18} /></div>
      </div>
      <div className="row wrap between" style={{ marginBottom: 16, gap: 10 }}>
        <Seg options={[{ value: 'all', label: 'All' }, ...COSMETIC_TYPES.map((t) => ({ value: t.type, label: t.plural }))]} value={type} onChange={(v) => setType(v as CosmeticType | 'all')} />
        <div className="row">
          <Seg options={[{ value: 'all', label: 'Any rarity' }, ...RARITIES.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))]} value={rarity} onChange={(v) => setRarity(v as Rarity | 'all')} />
          <button className={`btn btn-sm ${hideOwned ? 'btn-primary' : ''}`} onClick={() => setHideOwned((h) => !h)}>Hide owned</button>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(300px,1fr)', gap: 18, alignItems: 'start' }}>
        <div className="auto-grid" style={{ ['--min' as any]: '170px' }}>
          {items.map((c) => (
            <ItemCard key={c.id} item={c} owned={owned.has(c.id)} equipped={me.equipped[c.type] === c.id} selected={sel?.id === c.id} onClick={() => setSelId(c.id)} showPrice />
          ))}
          {items.length === 0 && <div className="muted small">No items match these filters.</div>}
        </div>
        {sel && (
          <div className="panel panel-pad col" style={{ gap: 14, position: 'sticky', top: 0 }}>
            <ItemStage item={sel} />
            <div>
              <div className="row between">
                <span className="display" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{sel.name}</span>
                <RarityTag rarity={sel.rarity} />
              </div>
              <div className="tiny muted upper" style={{ marginTop: 2 }}>{COSMETIC_TYPES.find((t) => t.type === sel.type)?.label}</div>
              <p className="dim small" style={{ margin: '6px 0 0' }}>{sel.description}</p>
            </div>
            {has ? (
              <button className="btn" onClick={() => navigate('/customise')}><Check /> Owned · Customise</button>
            ) : (
              <>
                <button className="btn btn-primary btn-lg" disabled={!afford || busy} onClick={() => setConfirm(true)}>
                  <ShoppingBag /> Buy for {price.toLocaleString()}
                </button>
                {!afford && <div className="small" style={{ color: 'var(--warn)' }}>You need {(price - me.points).toLocaleString()} more DC Points.</div>}
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/customise')}><Palette /> View all cosmetics, including earnable ones</button>
          </div>
        )}
      </div>
      <Confirm open={confirm} title={`Buy ${sel?.name}?`} body={<span>This costs <b>{price.toLocaleString()}</b> DC Points. You will have {(me.points - price).toLocaleString()} left.</span>} confirmLabel="Buy" onCancel={() => setConfirm(false)} onConfirm={buy} />
    </div>
  );
}
