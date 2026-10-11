// PROTOTYPE — throwaway. "Decantations" tab inside Inventory, with the
// drawer variant chosen by ?variant=A|B|C and a floating switcher bar.
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Chip, Icon, KpiStrip, KpiTile, Panel } from '../../../pump-ds/index.js';
import { DensityCalculator } from './DensityCalculator.js';
import {
  INITIAL_DECANTATIONS,
  PURCHASES,
  SETTINGS,
  TANKS,
  flagsFor,
  fmtL,
  fmtSigned,
  purchaseById,
  tankById,
  type ProtoDecantation,
} from './mock.js';
import { VARIANTS as BASE } from './variants.js';
import { VariantMulti } from './VariantMulti.js';

const VARIANTS = {
  E: { name: 'Accordion + multiple tanks', C: null },
  ...BASE,
} as const;
type VariantKey = keyof typeof VARIANTS;

const KEYS = Object.keys(VARIANTS) as VariantKey[];

const readVariant = (): VariantKey => {
  const v = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
  return (KEYS as string[]).includes(v ?? '') ? (v as VariantKey) : 'E';
};

const useVariant = () => {
  const [v, setV] = useState<VariantKey>(readVariant);
  const go = (next: VariantKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState(window.history.state, '', url);
    setV(next);
  };
  return [v, go] as const;
};

const PrototypeSwitcher: React.FC<{ current: VariantKey; onChange: (k: VariantKey) => void }> = ({
  current,
  onChange,
}) => {
  const i = KEYS.indexOf(current);
  const prev = () => onChange(KEYS[(i - 1 + KEYS.length) % KEYS.length]);
  const next = () => onChange(KEYS[(i + 1) % KEYS.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  if (import.meta.env.PROD) return null;
  const btn: React.CSSProperties = {
    background: 'none',
    border: 0,
    color: '#fff',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 16,
  };
  return (
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
        boxShadow: '0 6px 20px rgba(0,0,0,.35)',
        fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <button style={btn} onClick={prev} aria-label="Previous variant">
        ←
      </button>
      <span>
        PROTOTYPE · drawer <strong>{current}</strong> ({VARIANTS[current].name})
      </span>
      <button style={btn} onClick={next} aria-label="Next variant">
        →
      </button>
    </div>
  );
};

const th: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 500,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  opacity: 0.6,
  padding: '8px 12px',
  borderBottom: '1px solid var(--color-border, #e5e5e5)',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '9px 12px',
  borderBottom: '1px solid var(--color-border, #eee)',
  fontSize: 13,
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const Row: React.FC<{ d: ProtoDecantation; onLink: (id: string, pid: string) => void }> = ({
  d,
  onLink,
}) => {
  const f = flagsFor(d);
  const p = purchaseById(d.purchaseId);
  const flagged = f.densityOut || f.sealIssue;
  return (
    <tr
      style={
        flagged
          ? { background: 'color-mix(in oklab, var(--color-danger-fg, #b42318) 5%, transparent)' }
          : undefined
      }
    >
      <td style={td}>
        {d.date}
        <div style={{ fontSize: 11, opacity: 0.6 }}>
          {d.start}–{d.end}
        </div>
      </td>
      <td style={td}>
        {d.tankerNo}
        <div style={{ fontSize: 11, opacity: 0.6 }}>
          {d.driver}
          {d.lineCount && d.lineCount > 1 ? ` · split into ${d.lineCount} tanks` : ''}
        </div>
      </td>
      <td style={td}>
        {tankById(d.tankId)?.name} <span style={{ opacity: 0.6 }}>· {d.product}</span>
      </td>
      <td style={td}>
        {p ? (
          <span style={{ fontSize: 12 }}>{p.invoiceNo}</span>
        ) : (
          <select
            className="select"
            style={{ fontSize: 12, height: 26, padding: '0 6px' }}
            value=""
            onChange={(e) => e.target.value && onLink(d.id, e.target.value)}
          >
            <option value="">⚠ Link purchase…</option>
            {PURCHASES.filter((x) => x.product === d.product).map((x) => (
              <option key={x.id} value={x.id}>
                {x.invoiceNo} · {x.qty.toLocaleString('en-IN')} L
              </option>
            ))}
          </select>
        )}
      </td>
      <td style={num}>{fmtL(p?.qty)}</td>
      <td style={num}>
        {d.received != null ? (
          fmtL(d.received)
        ) : (
          <Chip tone="info" size="sm">
            Pending measurement
          </Chip>
        )}
      </td>
      <td style={num}>
        {f.qtyDiff != null ? (
          <Chip tone={f.qtyDiff < 0 ? 'danger' : 'success'} size="sm">
            {f.qtyDiff < 0 ? 'Short' : 'Excess'} {fmtSigned(f.qtyDiff, 'L')}
          </Chip>
        ) : (
          '—'
        )}
      </td>
      <td style={num}>
        {f.density != null ? (
          <Chip tone={f.densityOut ? 'danger' : 'success'} size="sm">
            {fmtSigned(f.density, 'kg/m³')}
          </Chip>
        ) : (
          <span style={{ opacity: 0.6 }}>{d.roDensity}</span>
        )}
      </td>
      <td style={td}>
        <div style={{ display: 'flex', gap: 4 }}>
          {flagged && (
            <Chip tone="danger" size="sm" icon={<Icon name="warning" size="xs" />}>
              Flagged
            </Chip>
          )}
          {f.unlinked && (
            <Chip tone="warning" size="sm">
              Purchase not linked
            </Chip>
          )}
        </div>
      </td>
    </tr>
  );
};

export const DecantationsPrototypeTab: React.FC = () => {
  const [variant, setVariant] = useVariant();
  const [rows, setRows] = useState<ProtoDecantation[]>(INITIAL_DECANTATIONS);
  const [open, setOpen] = useState(false);

  const kpis = useMemo(() => {
    const fl = rows.map((r) => flagsFor(r));
    const linked = new Set(rows.map((r) => r.purchaseId).filter(Boolean));
    return {
      pending: fl.filter((f) => f.pending).length,
      unlinked: fl.filter((f) => f.unlinked).length,
      flagged: fl.filter((f) => f.densityOut || f.sealIssue).length,
      awaiting: PURCHASES.filter((p) => !linked.has(p.id)),
      short: fl.reduce((s, f) => s + (f.qtyDiff != null && f.qtyDiff < 0 ? f.qtyDiff : 0), 0),
    };
  }, [rows]);

  const waitingTanks = TANKS.filter((t) =>
    rows.some((r) => r.tankId === t.id && r.status === 'pending'),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <KpiStrip columns="auto">
        <KpiTile
          dot={kpis.flagged ? 'danger' : 'success'}
          valueTone={kpis.flagged ? 'danger' : undefined}
          label="Flagged"
          value={String(kpis.flagged)}
          hint={`density beyond ±${SETTINGS.densityTolerance} kg/m³ or seal issue`}
        />
        <KpiTile
          dot={kpis.pending ? 'info' : 'success'}
          label="Pending measurement"
          value={String(kpis.pending)}
          hint="waiting for next Tank Dip"
        />
        <KpiTile
          dot={kpis.unlinked ? 'warning' : 'success'}
          valueTone={kpis.unlinked ? 'warning' : undefined}
          label="Purchase not linked"
          value={String(kpis.unlinked)}
          hint="variance waits for the invoice"
        />
        <KpiTile
          dot={kpis.awaiting.length ? 'warning' : 'success'}
          label="Awaiting decantation"
          value={String(kpis.awaiting.length)}
          hint="fuel purchases with no tanker yet"
        />
        <KpiTile
          dot={kpis.short < 0 ? 'danger' : 'neutral'}
          label="Short this month"
          value={fmtL(kpis.short)}
          hint="measured vs invoice"
        />
      </KpiStrip>

      {waitingTanks.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            fontSize: 13,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--color-info-bg, #eaf3ff)',
            color: 'var(--color-info-fg, #1d4ed8)',
          }}
        >
          <Icon name="info" size="sm" />
          {waitingTanks.map((t) => t.name).join(', ')}: <strong>Waiting on decantation</strong> —
          book stock excludes the new fuel until the next Tank Dip is recorded.
        </div>
      )}

      <Panel
        flush
        title="Decantations"
        action={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <DensityCalculator />
            <Button
              size="sm"
              leftIcon={<Icon name="truck" size="sm" />}
              onClick={() => setOpen(true)}
            >
              New Decantation
            </Button>
          </div>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Tanker</th>
                <th style={th}>Tank</th>
                <th style={th}>Fuel Purchase</th>
                <th style={{ ...th, textAlign: 'right' }}>Invoice</th>
                <th style={{ ...th, textAlign: 'right' }}>Received</th>
                <th style={{ ...th, textAlign: 'right' }}>Qty variance</th>
                <th style={{ ...th, textAlign: 'right' }}>Density Δ</th>
                <th style={th}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((d) => (
                <Row
                  key={d.id}
                  d={d}
                  onLink={(id, pid) =>
                    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, purchaseId: pid } : r)))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {kpis.awaiting.length > 0 && (
        <Panel title="Fuel Purchases awaiting decantation">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {kpis.awaiting.map((p) => (
              <Chip key={p.id} tone="warning" size="sm">
                {p.invoiceNo} · {p.product} · {fmtL(p.qty)}
              </Chip>
            ))}
          </div>
        </Panel>
      )}

      {variant === 'E' ? (
        <VariantMulti
          key={variant}
          isOpen={open}
          onClose={() => setOpen(false)}
          onSave={(ds) => setRows((rs) => [...rs, ...ds])}
        />
      ) : (
        React.createElement(BASE[variant as keyof typeof BASE].C, {
          key: variant,
          isOpen: open,
          onClose: () => setOpen(false),
          onSave: (d: ProtoDecantation) => setRows((rs) => [...rs, d]),
        })
      )}
      <PrototypeSwitcher current={variant} onChange={setVariant} />
    </div>
  );
};
