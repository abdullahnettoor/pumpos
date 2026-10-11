// PROTOTYPE — throwaway. Density register (#471). Three layouts on the
// Inventory → Density tab, switched by ?dvariant=A|B|C. Mock data only.
//   A — Register book: chronological log, like the paper register.
//   B — Tank cards: today's reading per tank, trend, quick inline entry.
//   C — Matrix + board: tanks × days grid, and a printable "Today's density" board.
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Chip, Icon, KpiStrip, KpiTile, Panel, Sparkline } from '../../../pump-ds/index.js';
import { Drawer } from '../../Drawer.js';
import { Field, NumberInput, Select } from '../../primitives/Field.js';
import { density15 } from './DensityCalculator.js';
import { SETTINGS, TANKS } from './mock.js';

type Source = 'Morning' | 'Decantation' | 'Ad-hoc';
interface Reading {
  id: string;
  date: string; // business date
  time: string;
  tankId: string;
  source: Source;
  observed: number;
  temp: number;
  d15: number;
  by: string;
}

const TODAY = '2026-10-11';
const days = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
const DAYS14 = days(14);

// Spec band per product (BIS IS 2796 / IS 1460 commonly quoted; unverified).
const SPEC = { MS: [720, 775], HSD: [820, 860] } as const;

const seed = (): Reading[] => {
  const out: Reading[] = [];
  const base: Record<string, number> = { t1: 744.6, t2: 833.1, t3: 831.4 };
  const decant: Record<string, string> = { '2026-10-09': 't1', '2026-10-10': 't2' };
  DAYS14.forEach((date, di) => {
    TANKS.forEach((t) => {
      if (date === TODAY && t.id !== 't1') return; // today missing for t2, t3
      if (di === 6 && t.id === 't3') return; // a missed day
      const wob = ((di * 7 + t.id.length * 3) % 5) * 0.1 - 0.2;
      const d15 = +(base[t.id] + wob).toFixed(1);
      const temp = 28 + ((di + 2) % 5);
      out.push({
        id: `${date}-${t.id}-m`,
        date,
        time: '06:10',
        tankId: t.id,
        source: 'Morning',
        observed: +(d15 - 0.68 * (temp - 15)).toFixed(1),
        temp,
        d15,
        by: 'Rahul (Manager)',
      });
      if (decant[date] === t.id) {
        base[t.id] += t.id === 't2' ? 4.0 : 0.3; // t2 jumped after a decantation
        out.push({
          id: `${date}-${t.id}-d`,
          date,
          time: '14:58',
          tankId: t.id,
          source: 'Decantation',
          observed: +(base[t.id] - 0.68 * 16).toFixed(1),
          temp: 31,
          d15: +base[t.id].toFixed(1),
          by: 'Rahul (Manager)',
        });
      }
    });
  });
  return out;
};

const tank = (id: string) => TANKS.find((t) => t.id === id)!;
const sortDesc = (a: Reading, b: Reading) => (b.date + b.time).localeCompare(a.date + a.time);

/** Δ vs the previous reading of the same tank. */
const withDelta = (rows: Reading[]) => {
  const asc = [...rows].sort((a, b) => -sortDesc(a, b));
  const prev: Record<string, Reading | undefined> = {};
  const m = new Map<string, number | null>();
  asc.forEach((r) => {
    const p = prev[r.tankId];
    m.set(r.id, p ? +(r.d15 - p.d15).toFixed(1) : null);
    prev[r.tankId] = r;
  });
  return m;
};

const DeltaChip: React.FC<{ d: number | null; source: Source }> = ({ d, source }) => {
  if (d == null) return <span style={{ opacity: 0.5 }}>—</span>;
  const big = Math.abs(d) > SETTINGS.densityTolerance;
  // A jump right after a Decantation is expected; without one it is suspicious.
  const tone = big ? (source === 'Decantation' ? 'info' : 'danger') : 'neutral';
  return (
    <Chip tone={tone} size="sm">
      {d > 0 ? '+' : ''}
      {d}
      {big && source !== 'Decantation' ? ' · no decantation' : ''}
    </Chip>
  );
};

const outOfSpec = (r: Reading) => {
  const [lo, hi] = SPEC[tank(r.tankId).product];
  return r.d15 < lo || r.d15 > hi;
};

/* ------------------------- Record drawer (shared) ------------------------- */

const RecordDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (rs: Reading[]) => void;
  presetTank?: string;
}> = ({ isOpen, onClose, onSave, presetTank }) => {
  const [source, setSource] = useState<Source>('Morning');
  const [mode, setMode] = useState<'calc' | 'direct'>('calc');
  const [vals, setVals] = useState<Record<string, { obs: string; temp: string; d15: string }>>({});
  const list = presetTank ? TANKS.filter((t) => t.id === presetTank) : TANKS;
  const v = (id: string) => vals[id] ?? { obs: '', temp: '', d15: '' };
  const set = (id: string, k: 'obs' | 'temp' | 'd15', x: string) =>
    setVals((s) => ({ ...s, [id]: { ...v(id), [k]: x } }));
  const result = (id: string) => {
    const x = v(id);
    if (mode === 'direct') return x.d15 ? Number(x.d15) : null;
    return x.obs && x.temp ? density15(Number(x.obs), Number(x.temp)) : null;
  };
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={presetTank ? `Record density · ${tank(presetTank).name}` : 'Record density'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(
                list
                  .filter((t) => result(t.id) != null)
                  .map((t) => ({
                    id: `${Date.now()}-${t.id}`,
                    date: TODAY,
                    time: new Date().toTimeString().slice(0, 5),
                    tankId: t.id,
                    source,
                    observed: Number(v(t.id).obs || result(t.id)),
                    temp: Number(v(t.id).temp || 15),
                    d15: result(t.id)!,
                    by: 'You',
                  })),
              );
              setVals({});
              onClose();
            }}
          >
            Save readings
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Reading">
          <Select value={source} onChange={(e) => setSource(e.target.value as Source)}>
            <option>Morning</option>
            <option>Ad-hoc</option>
          </Select>
        </Field>
        <Field label="Entry" hint="Default comes from Station Settings">
          <Select value={mode} onChange={(e) => setMode(e.target.value as 'calc' | 'direct')}>
            <option value="calc">Hydrometer + temperature</option>
            <option value="direct">Density at 15 °C directly</option>
          </Select>
        </Field>
      </div>
      {list.map((t) => {
        const r = result(t.id);
        const [lo, hi] = SPEC[t.product];
        const bad = r != null && (r < lo || r > hi);
        return (
          <div
            key={t.id}
            style={{
              borderTop: '1px solid var(--color-border,#eee)',
              padding: '10px 0 0',
              marginTop: 4,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {t.name} · {t.product}
              <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12 }}>
                {' '}
                · spec {lo}–{hi}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {mode === 'calc' ? (
                <>
                  <Field label="Hydrometer (kg/m³)">
                    <NumberInput
                      value={v(t.id).obs}
                      onChange={(e) => set(t.id, 'obs', e.target.value)}
                    />
                  </Field>
                  <Field label="Temp (°C)">
                    <NumberInput
                      value={v(t.id).temp}
                      onChange={(e) => set(t.id, 'temp', e.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <Field label="Density at 15 °C" style={{ gridColumn: 'span 2' }}>
                  <NumberInput
                    value={v(t.id).d15}
                    onChange={(e) => set(t.id, 'd15', e.target.value)}
                  />
                </Field>
              )}
              <div style={{ paddingTop: 20 }}>
                <div style={{ fontSize: 11, opacity: 0.6 }}>At 15 °C</div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: bad ? 'var(--color-danger-fg,#b42318)' : undefined,
                  }}
                >
                  {r ?? '—'}
                </div>
              </div>
            </div>
            {bad && (
              <div
                style={{ fontSize: 12, color: 'var(--color-danger-fg,#b42318)', marginBottom: 8 }}
              >
                Outside spec band. You can still save — it will be flagged.
              </div>
            )}
          </div>
        );
      })}
    </Drawer>
  );
};

/* ------------------------------ Variant A ------------------------------ */

const th: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 500,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  opacity: 0.6,
  padding: '8px 12px',
  borderBottom: '1px solid var(--color-border,#e5e5e5)',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--color-border,#eee)',
  fontSize: 13,
  whiteSpace: 'nowrap',
};
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const VariantA: React.FC<VProps> = ({ rows, onRecord }) => {
  const [tankF, setTankF] = useState('');
  const delta = useMemo(() => withDelta(rows), [rows]);
  const list = rows.filter((r) => !tankF || r.tankId === tankF).sort(sortDesc);
  let lastDate = '';
  return (
    <Panel
      flush
      title="Density register"
      action={
        <div style={{ display: 'flex', gap: 6 }}>
          <Select
            value={tankF}
            onChange={(e) => setTankF(e.target.value)}
            style={{ height: 30, fontSize: 12 }}
          >
            <option value="">All tanks</option>
            {TANKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button size="sm" leftIcon={<Icon name="plus" size="sm" />} onClick={() => onRecord()}>
            Record density
          </Button>
        </div>
      }
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Date</th>
            <th style={th}>Time</th>
            <th style={th}>Tank</th>
            <th style={th}>Reading</th>
            <th style={{ ...th, textAlign: 'right' }}>Hydrometer</th>
            <th style={{ ...th, textAlign: 'right' }}>Temp</th>
            <th style={{ ...th, textAlign: 'right' }}>At 15 °C</th>
            <th style={{ ...th, textAlign: 'right' }}>Δ previous</th>
            <th style={th}>By</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const showDate = r.date !== lastDate;
            lastDate = r.date;
            return (
              <tr
                key={r.id}
                style={showDate ? { borderTop: '2px solid var(--color-border,#ddd)' } : undefined}
              >
                <td style={td}>{showDate ? r.date : ''}</td>
                <td style={td}>{r.time}</td>
                <td style={td}>
                  {tank(r.tankId).name}{' '}
                  <span style={{ opacity: 0.6 }}>· {tank(r.tankId).product}</span>
                </td>
                <td style={td}>
                  <Chip size="sm" tone={r.source === 'Decantation' ? 'brand' : 'neutral'}>
                    {r.source}
                  </Chip>
                </td>
                <td style={num}>{r.observed}</td>
                <td style={num}>{r.temp} °C</td>
                <td
                  style={{
                    ...num,
                    fontWeight: 600,
                    color: outOfSpec(r) ? 'var(--color-danger-fg,#b42318)' : undefined,
                  }}
                >
                  {r.d15}
                </td>
                <td style={num}>
                  <DeltaChip d={delta.get(r.id) ?? null} source={r.source} />
                </td>
                <td style={{ ...td, opacity: 0.7 }}>{r.by}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
};

/* ------------------------------ Variant B ------------------------------ */

const VariantB: React.FC<VProps> = ({ rows, onRecord }) => {
  const delta = useMemo(() => withDelta(rows), [rows]);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 12,
      }}
    >
      {TANKS.map((t) => {
        const mine = rows.filter((r) => r.tankId === t.id).sort(sortDesc);
        const today = mine.find((r) => r.date === TODAY && r.source === 'Morning');
        const last = mine[0];
        const trend = DAYS14.map((d) => mine.find((r) => r.date === d)?.d15).filter(
          (x): x is number => x != null,
        );
        const [lo, hi] = SPEC[t.product];
        return (
          <Panel
            key={t.id}
            title={`${t.name} · ${t.product}`}
            action={
              today ? (
                <Chip size="sm" tone="success" icon={<Icon name="check" size="xs" />}>
                  Recorded {today.time}
                </Chip>
              ) : (
                <Chip size="sm" tone="warning">
                  Today missing
                </Chip>
              )
            }
          >
            <div
              style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  {today ? "Today's density at 15 °C" : `Last reading · ${last?.date}`}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    opacity: today ? 1 : 0.45,
                  }}
                >
                  {(today ?? last)?.d15 ?? '—'}
                  <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6 }}> kg/m³</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  Spec {lo}–{hi} · Δ{' '}
                  {last ? <DeltaChip d={delta.get(last.id) ?? null} source={last.source} /> : '—'}
                </div>
              </div>
              <Sparkline data={trend} width={110} height={36} tone="brand" fill />
            </div>
            <div
              style={{
                borderTop: '1px solid var(--color-border,#eee)',
                marginTop: 12,
                paddingTop: 8,
              }}
            >
              {mine.slice(0, 4).map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    padding: '3px 0',
                  }}
                >
                  <span style={{ opacity: 0.7 }}>
                    {r.date.slice(5)} {r.time} · {r.source}
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{r.d15}</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <Button
                size="sm"
                variant={today ? 'secondary' : 'primary'}
                fullWidth
                leftIcon={<Icon name="plus" size="sm" />}
                onClick={() => onRecord(t.id)}
              >
                {today ? 'Add reading' : "Record today's density"}
              </Button>
            </div>
          </Panel>
        );
      })}
    </div>
  );
};

/* ------------------------------ Variant C ------------------------------ */

const VariantC: React.FC<VProps> = ({ rows, onRecord }) => {
  const [board, setBoard] = useState(false);
  const delta = useMemo(() => withDelta(rows), [rows]);
  const cellFor = (tankId: string, date: string) =>
    rows.filter((r) => r.tankId === tankId && r.date === date).sort(sortDesc);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Panel
        flush
        title="Last 14 days · density at 15 °C"
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="printer" size="sm" />}
              onClick={() => setBoard(true)}
            >
              Today's board
            </Button>
            <Button size="sm" leftIcon={<Icon name="plus" size="sm" />} onClick={() => onRecord()}>
              Record density
            </Button>
          </div>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Tank</th>
                {DAYS14.map((d) => (
                  <th
                    key={d}
                    style={{
                      ...th,
                      textAlign: 'center',
                      padding: '8px 4px',
                      background: d === TODAY ? 'var(--color-surface-alt,#f5f5f5)' : undefined,
                    }}
                  >
                    {d.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TANKS.map((t) => (
                <tr key={t.id}>
                  <td style={td}>
                    {t.name} <span style={{ opacity: 0.6 }}>· {t.product}</span>
                  </td>
                  {DAYS14.map((d) => {
                    const c = cellFor(t.id, d);
                    const r = c[0];
                    const dd = r ? (delta.get(r.id) ?? null) : null;
                    const big = dd != null && Math.abs(dd) > SETTINGS.densityTolerance;
                    const dec = c.some((x) => x.source === 'Decantation');
                    return (
                      <td
                        key={d}
                        title={c.map((x) => `${x.time} ${x.source}: ${x.d15}`).join('\n')}
                        onClick={() => !r && d === TODAY && onRecord(t.id)}
                        style={{
                          ...num,
                          textAlign: 'center',
                          padding: '8px 4px',
                          fontSize: 12,
                          cursor: !r && d === TODAY ? 'pointer' : 'default',
                          background: !r
                            ? d === TODAY
                              ? 'var(--color-warning-bg,#fff7e6)'
                              : 'repeating-linear-gradient(45deg,transparent 0 4px,rgba(0,0,0,.04) 4px 8px)'
                            : big
                              ? dec
                                ? 'var(--color-info-bg,#eaf3ff)'
                                : 'var(--color-danger-bg,#fdecec)'
                              : undefined,
                        }}
                      >
                        {r ? r.d15.toFixed(1) : d === TODAY ? '+ add' : '—'}
                        {dec && <div style={{ fontSize: 9, opacity: 0.7 }}>▲ decant</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, opacity: 0.7, padding: '8px 12px' }}>
          <span>
            ■ <span style={{ color: 'var(--color-danger-fg,#b42318)' }}>red</span> Δ &gt;{' '}
            {SETTINGS.densityTolerance} with no decantation
          </span>
          <span>
            ■ <span style={{ color: 'var(--color-info-fg,#1d4ed8)' }}>blue</span> change after a
            decantation
          </span>
          <span>▨ missed day</span>
        </div>
      </Panel>

      {board && (
        <Drawer
          isOpen
          onClose={() => setBoard(false)}
          title="Today's density board"
          widthVariant="wide"
        >
          <div
            style={{
              border: '2px solid #111',
              borderRadius: 12,
              padding: 24,
              textAlign: 'center',
              background: '#fff',
              color: '#111',
            }}
          >
            <div style={{ fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase' }}>
              Density at 15 °C
            </div>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 18 }}>{TODAY}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
              {(['MS', 'HSD'] as const).map((p) => {
                const tk = TANKS.filter((t) => t.product === p);
                return (
                  <div key={p}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {p === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'}
                    </div>
                    {tk.map((t) => {
                      const r = rows
                        .filter((x) => x.tankId === t.id && x.date === TODAY)
                        .sort(sortDesc)[0];
                      return (
                        <div key={t.id} style={{ marginTop: 8 }}>
                          <div
                            style={{
                              fontSize: 44,
                              fontWeight: 800,
                              fontVariantNumeric: 'tabular-nums',
                              color: r ? '#111' : '#bbb',
                            }}
                          >
                            {r ? r.d15.toFixed(1) : '— — —'}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.6 }}>
                            {t.name} · kg/m³{!r && ' · not recorded yet'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button
              size="sm"
              leftIcon={<Icon name="printer" size="sm" />}
              onClick={() => window.print()}
            >
              Print
            </Button>
          </div>
        </Drawer>
      )}
    </div>
  );
};

/* ------------------------------ Tab + switcher ------------------------------ */

interface VProps {
  rows: Reading[];
  onRecord: (tankId?: string) => void;
}
const VARIANTS = {
  A: { name: 'Register book', C: VariantA },
  B: { name: 'Tank cards', C: VariantB },
  C: { name: 'Matrix + board', C: VariantC },
} as const;
type Key = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Key[];

const useV = () => {
  const read = (): Key => {
    const v = new URLSearchParams(window.location.search).get('dvariant')?.toUpperCase();
    return (KEYS as string[]).includes(v ?? '') ? (v as Key) : 'A';
  };
  const [v, setV] = useState<Key>(read);
  const go = (k: Key) => {
    const u = new URL(window.location.href);
    u.searchParams.set('dvariant', k);
    window.history.replaceState(window.history.state, '', u);
    setV(k);
  };
  return [v, go] as const;
};

export const DensityRegisterPrototypeTab: React.FC = () => {
  const [v, go] = useV();
  const [rows, setRows] = useState<Reading[]>(seed);
  const [rec, setRec] = useState<{ open: boolean; tank?: string }>({ open: false });
  const i = KEYS.indexOf(v);
  const prev = () => go(KEYS[(i - 1 + KEYS.length) % KEYS.length]);
  const next = () => go(KEYS[(i + 1) % KEYS.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const missing = TANKS.filter(
    (t) => !rows.some((r) => r.tankId === t.id && r.date === TODAY && r.source === 'Morning'),
  );
  const delta = withDelta(rows);
  const suspicious = rows.filter(
    (r) => r.source !== 'Decantation' && Math.abs(delta.get(r.id) ?? 0) > SETTINGS.densityTolerance,
  ).length;
  const V = VARIANTS[v].C;
  const btn: React.CSSProperties = {
    background: 'none',
    border: 0,
    color: '#fff',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 16,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <KpiStrip columns="auto">
        <KpiTile
          dot={missing.length ? 'warning' : 'success'}
          valueTone={missing.length ? 'warning' : undefined}
          label="Today's readings"
          value={`${TANKS.length - missing.length}/${TANKS.length}`}
          hint={
            missing.length
              ? `missing: ${missing.map((t) => t.name).join(', ')}`
              : 'all tanks recorded'
          }
        />
        <KpiTile
          dot={suspicious ? 'danger' : 'success'}
          valueTone={suspicious ? 'danger' : undefined}
          label="Unexplained jumps"
          value={String(suspicious)}
          hint={`Δ > ${SETTINGS.densityTolerance} kg/m³ without a decantation`}
        />
        <KpiTile
          dot="neutral"
          label="Readings (14 days)"
          value={String(rows.length)}
          hint="morning + decantation + ad-hoc"
        />
      </KpiStrip>
      {missing.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            fontSize: 13,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--color-warning-bg,#fff7e6)',
            color: 'var(--color-warning-fg,#8a5a00)',
          }}
        >
          <Icon name="warning" size="sm" />
          Morning density not recorded for {missing.map((t) => t.name).join(', ')}.
          <span style={{ flex: 1 }} />
          <Button size="xs" variant="outline" onClick={() => setRec({ open: true })}>
            Record now
          </Button>
        </div>
      )}
      <V rows={rows} onRecord={(tankId) => setRec({ open: true, tank: tankId })} />
      <RecordDrawer
        key={rec.tank ?? 'all'}
        isOpen={rec.open}
        presetTank={rec.tank}
        onClose={() => setRec({ open: false })}
        onSave={(rs) => setRows((x) => [...x, ...rs])}
      />
      {!import.meta.env.PROD && (
        <div
          style={{
            position: 'fixed',
            bottom: 18,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            background: '#111',
            color: '#fff',
            borderRadius: 999,
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontFamily: 'system-ui,sans-serif',
            boxShadow: '0 6px 20px rgba(0,0,0,.35)',
          }}
        >
          <button style={btn} onClick={prev} aria-label="Previous variant">
            ←
          </button>
          <span>
            PROTOTYPE · density <strong>{v}</strong> ({VARIANTS[v].name})
          </span>
          <button style={btn} onClick={next} aria-label="Next variant">
            →
          </button>
        </div>
      )}
    </div>
  );
};
