// PROTOTYPE — throwaway (#476). The Decantations page pushed from Home → Tanks,
// plus the floating variant switcher (?mvariant=A|B|C).
import React, { useEffect, useState } from 'react';
import { useNav } from '../../shell/nav.js';
import { DetailPage, ListGroup, ListRow, SectionLabel, StatusBadge } from '../../ui/index.js';
import { FLOWS, type FlowKey } from './flows.js';
import { PRODUCT_NAME, SEED, derive, lakh, type Visit } from './model.js';

const KEYS = Object.keys(FLOWS) as FlowKey[];
const readKey = (): FlowKey => {
  const v = new URLSearchParams(window.location.search).get('mvariant')?.toUpperCase();
  return (KEYS as string[]).includes(v ?? '') ? (v as FlowKey) : 'A';
};

const Switcher: React.FC<{ value: FlowKey; onChange: (k: FlowKey) => void }> = ({
  value,
  onChange,
}) => {
  if (import.meta.env.PROD) return null;
  const i = KEYS.indexOf(value);
  const go = (d: number) => onChange(KEYS[(i + d + KEYS.length) % KEYS.length]);
  return (
    <div className="fixed bottom-[88px] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1 text-[11px] text-white shadow-lg">
      <button
        type="button"
        className="px-2 text-base"
        onClick={() => go(-1)}
        aria-label="Previous variant"
      >
        ←
      </button>
      <span>
        PROTOTYPE · <b>{value}</b> {FLOWS[value].name}
      </span>
      <button
        type="button"
        className="px-2 text-base"
        onClick={() => go(1)}
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
};

// Module-level so pushed pages and the list share it (prototype only).
let STORE: Visit[] = SEED;
const listeners = new Set<() => void>();
const save = (v: Visit) => {
  STORE = [v, ...STORE.filter((x) => x.id !== v.id)];
  listeners.forEach((l) => l());
};
const useStore = () => {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return STORE;
};

const DENSITY_TODAY: { product: 'MS' | 'HSD'; value: number | null; time?: string }[] = [
  { product: 'MS', value: 744.9, time: '06:10' },
  { product: 'HSD', value: null },
];

export const DecantationsPrototypePage: React.FC = () => {
  const nav = useNav();
  const rows = useStore();
  const [key, setKey] = useState<FlowKey>(readKey);
  const setVariant = (k: FlowKey) => {
    const u = new URL(window.location.href);
    u.searchParams.set('mvariant', k);
    window.history.replaceState(window.history.state, '', u);
    setKey(k);
  };
  const Flow = FLOWS[key].C;
  const open = (initial?: Visit) =>
    nav.push(
      <Flow
        initial={initial}
        onDone={(v) => {
          save(v);
          nav.back();
        }}
      />,
      `decant:${key}:${initial?.id ?? 'new'}`,
    );

  const pending = rows.filter((r) => r.stage === 'arrived' || derive(r).pending);

  return (
    <DetailPage
      title="Decantations"
      subtitle="Tanker unloading"
      actions={
        <button
          type="button"
          onClick={() => open()}
          className="flex h-11 flex-1 items-center justify-center rounded-[13px] bg-accent text-[13.5px] font-bold text-white"
        >
          + New Decantation
        </button>
      }
    >
      <SectionLabel>Density today</SectionLabel>
      <div className="grid grid-cols-2 gap-2 px-3">
        {DENSITY_TODAY.map((d) => (
          <div key={d.product} className="rounded-[14px] border border-line bg-card p-3">
            <p className="text-xs font-bold text-text-high">{PRODUCT_NAME[d.product]}</p>
            <p
              className={`num mt-1 text-xl font-semibold ${d.value ? 'text-text-high' : 'text-text-faint'}`}
            >
              {d.value ?? '— — —'}
            </p>
            <p className="mt-0.5 text-[10.5px] text-text-muted">
              {d.value ? `kg/m³ · ${d.time}` : 'Not recorded today'}
            </p>
            {!d.value && (
              <button type="button" className="mt-2 text-[12px] font-bold text-accent">
                Record ›
              </button>
            )}
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <>
          <SectionLabel>Needs finishing</SectionLabel>
          <ListGroup>
            {pending.map((r) => {
              const d = derive(r);
              return (
                <ListRow
                  key={r.id}
                  title={`${r.tanker} · ${d.lines.map((l) => l.tank.name).join(' + ')}`}
                  meta={
                    r.stage === 'arrived'
                      ? `Arrived ${r.start || '—'} · finish unloading`
                      : 'Waiting on decantation · next Tank Dip measures it'
                  }
                  end={
                    <StatusBadge tone={r.stage === 'arrived' ? 'warn' : 'info'}>
                      {r.stage === 'arrived' ? 'Unloading' : 'Pending'}
                    </StatusBadge>
                  }
                  onPress={() => open(r)}
                />
              );
            })}
          </ListGroup>
        </>
      )}

      <SectionLabel>Recent</SectionLabel>
      <ListGroup>
        {rows.map((r) => {
          const d = derive(r);
          const inv = d.invoices[0];
          return (
            <ListRow
              key={r.id}
              title={`${r.tanker || 'Tanker'} · ${d.lines.map((l) => l.label).join(' + ')}`}
              meta={[
                d.purchases.length
                  ? d.purchases.map((p) => p.no).join(', ')
                  : 'Purchase not linked',
                inv?.received != null ? `received ${lakh(inv.received)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              wrapMeta
              end={
                d.flags.length ? (
                  <StatusBadge tone="bad">Flagged</StatusBadge>
                ) : inv?.diff != null ? (
                  <StatusBadge tone={inv.diff < 0 ? 'bad' : 'good'} num>
                    {inv.diff > 0 ? '+' : ''}
                    {inv.diff} L
                  </StatusBadge>
                ) : d.unlinked.length ? (
                  <StatusBadge tone="warn">Not linked</StatusBadge>
                ) : (
                  <StatusBadge tone="info">Pending</StatusBadge>
                )
              }
              onPress={() => open(r)}
            />
          );
        })}
      </ListGroup>
      <Switcher value={key} onChange={setVariant} />
    </DetailPage>
  );
};
