// PROTOTYPE — throwaway. Shared draft state + small pieces used by the
// three Decantation drawer variants.
import React, { useMemo, useState } from 'react';
import { Chip, Icon } from '../../../pump-ds/index.js';
import {
  PURCHASES,
  SETTINGS,
  TANKS,
  fmtL,
  fmtSigned,
  receivedQty,
  type ProtoDecantation,
} from './mock.js';

export interface Draft {
  tankerNo: string;
  driver: string;
  product: 'MS' | 'HSD';
  purchaseId: string | null;
  tankId: string;
  sealOk: boolean;
  beforeDip: string;
  roDensity: string;
  start: string;
  end: string;
  doAfterDip: boolean;
  afterDip: string;
  afterDipAt: string;
  salesDuring: string;
  chambers: Chamber[];
}

export interface Chamber {
  capacity: string;
  sealOk: boolean;
  mark: 'ok' | 'short' | '';
  dipMm: string;
  emptied: boolean;
}

export const newChamber = (capacity = ''): Chamber => ({
  capacity,
  sealOk: true,
  mark: '',
  dipMm: '',
  emptied: false,
});

export const emptyDraft = (): Draft => ({
  tankerNo: '',
  driver: '',
  product: 'HSD',
  purchaseId: null,
  tankId: 't3',
  sealOk: true,
  beforeDip: '',
  roDensity: '',
  start: '',
  end: '',
  doAfterDip: false,
  afterDip: '',
  afterDipAt: '',
  salesDuring: '',
  chambers: [newChamber('4000'), newChamber('4000'), newChamber('4000')],
});

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const useDraft = () => {
  const [d, setD] = useState<Draft>(emptyDraft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const derived = useMemo(() => {
    const purchase = PURCHASES.find((p) => p.id === d.purchaseId);
    const tank = TANKS.find((t) => t.id === d.tankId);
    const ro = d.roDensity ? Number(d.roDensity) : null;
    const densityDiff = purchase && ro != null ? +(ro - purchase.invoiceDensity).toFixed(1) : null;
    const densityOut = densityDiff != null && Math.abs(densityDiff) > SETTINGS.densityTolerance;
    const received =
      d.doAfterDip && d.afterDip && d.beforeDip
        ? receivedQty(Number(d.beforeDip), Number(d.afterDip), Number(d.salesDuring || 0))
        : null;
    const qtyDiff = purchase && received != null ? received - purchase.qty : null;
    const earlyDip =
      d.doAfterDip &&
      d.end &&
      d.afterDipAt &&
      minutes(d.afterDipAt) - minutes(d.end) < SETTINGS.settlingMinutes;
    const chamberTotal = d.chambers.reduce((a, c) => a + Number(c.capacity || 0), 0);
    const chamberMismatch = !!purchase && chamberTotal > 0 && chamberTotal !== purchase.qty;
    const chamberShort = d.chambers.some((c) => c.mark === 'short' || !c.sealOk);
    const notEmptied = d.chambers.length > 0 && d.end !== '' && d.chambers.some((c) => !c.emptied);
    const tanksForProduct = TANKS.filter((t) => t.product === d.product);
    const openPurchases = PURCHASES.filter((p) => p.product === d.product);
    return {
      purchase,
      tank,
      densityDiff,
      densityOut,
      received,
      qtyDiff,
      earlyDip: !!earlyDip,
      chamberTotal,
      chamberMismatch,
      chamberShort,
      notEmptied,
      flagged:
        densityOut ||
        chamberShort ||
        !!earlyDip ||
        (d.end !== '' && d.chambers.some((c) => !c.emptied)),
      tanksForProduct,
      openPurchases,
    };
  }, [d]);

  const toDecantation = (): ProtoDecantation => ({
    id: `d${Date.now()}`,
    date: '2026-10-11',
    tankerNo: d.tankerNo || 'KL-07-XX-0000',
    driver: d.driver,
    tankId: d.tankId,
    product: d.product,
    purchaseId: d.purchaseId,
    beforeDip: Number(d.beforeDip || 0),
    roDensity: Number(d.roDensity || 0),
    start: d.start,
    end: d.end,
    afterDip: derived.received != null ? Number(d.afterDip) : null,
    salesDuring: Number(d.salesDuring || 0),
    status: derived.received != null ? 'measured' : 'pending',
    received: derived.received,
    sealOk: d.sealOk && !d.chambers.some((c) => c.mark === 'short' || !c.sealOk),
  });

  return { d, set, ...derived, toDecantation };
};

export type DraftApi = ReturnType<typeof useDraft>;

/** Strong, non-blocking warning. PumpOS never rejects a tanker. */
export const Warn: React.FC<{
  children: React.ReactNode;
  tone?: 'warning' | 'danger' | 'info';
}> = ({ children, tone = 'warning' }) => {
  const bg = {
    warning: 'var(--color-warning-bg, #fff7e6)',
    danger: 'var(--color-danger-bg, #fdecec)',
    info: 'var(--color-info-bg, #eaf3ff)',
  }[tone];
  const fg = {
    warning: 'var(--color-warning-fg, #8a5a00)',
    danger: 'var(--color-danger-fg, #b42318)',
    info: 'var(--color-info-fg, #1d4ed8)',
  }[tone];
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        padding: '8px 10px',
        borderRadius: 6,
        background: bg,
        color: fg,
        fontSize: 12,
        lineHeight: 1.4,
        marginBottom: 12,
      }}
    >
      <Icon name={tone === 'info' ? 'info' : 'warning'} size="sm" />
      <div>{children}</div>
    </div>
  );
};

export const DraftWarnings: React.FC<{ api: DraftApi }> = ({ api }) => (
  <>
    {api.densityOut && (
      <Warn tone="danger">
        <strong>Density off by {fmtSigned(api.densityDiff!, 'kg/m³')}</strong> (limit ±
        {SETTINGS.densityTolerance}). You can still save — this Decantation will be flagged for the
        Owner.
      </Warn>
    )}
    {api.chamberShort && (
      <Warn tone="danger">
        <strong>Tanker arrived short or a seal is broken.</strong> Likely a transit loss to claim.
        Saved Decantation will be flagged.
      </Warn>
    )}
    {api.chamberMismatch && (
      <Warn>
        Chambers add up to {fmtL(api.chamberTotal)}, invoice says {fmtL(api.purchase?.qty)}.
      </Warn>
    )}
    {api.notEmptied && (
      <Warn tone="danger">
        Not every chamber is marked emptied. Fuel may be left in the tanker — it will be flagged.
      </Warn>
    )}
    {api.earlyDip && (
      <Warn>
        After-unloading dip taken before the {SETTINGS.settlingMinutes} min settling time. Reading
        may be off; it will be flagged.
      </Warn>
    )}
    {!api.purchase && (
      <Warn tone="info">
        No Fuel Purchase linked. You can link it later; variance waits until then.
      </Warn>
    )}
    {!api.d.doAfterDip && (
      <Warn tone="info">
        No after-unloading dip. Stock is added when the next routine Tank Dip of{' '}
        {api.tank?.name ?? 'this tank'} is recorded. Until then the tank shows “Waiting on
        decantation”.
      </Warn>
    )}
  </>
);

export const ResultRows: React.FC<{ api: DraftApi }> = ({ api }) => {
  const rows: [string, React.ReactNode][] = [
    ['Invoice qty', fmtL(api.purchase?.qty)],
    [
      'Received (measured)',
      api.received != null ? (
        fmtL(api.received)
      ) : (
        <Chip tone="info" size="sm">
          Pending measurement
        </Chip>
      ),
    ],
    [
      'Quantity variance',
      api.qtyDiff != null ? (
        <Chip tone={api.qtyDiff < 0 ? 'danger' : 'success'} size="sm">
          {api.qtyDiff < 0 ? 'Short' : 'Excess'} {fmtSigned(api.qtyDiff, 'L')}
        </Chip>
      ) : (
        '—'
      ),
    ],
    ['Invoice density', api.purchase ? `${api.purchase.invoiceDensity} kg/m³` : '—'],
    ['RO density', api.d.roDensity ? `${api.d.roDensity} kg/m³` : '—'],
    [
      'Density variation',
      api.densityDiff != null ? (
        <Chip tone={api.densityOut ? 'danger' : 'success'} size="sm">
          {fmtSigned(api.densityDiff, 'kg/m³')}
        </Chip>
      ) : (
        '—'
      ),
    ],
  ];
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 13 }}
    >
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <span style={{ opacity: 0.65 }}>{k}</span>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

export const SectionTitle: React.FC<{ n?: number; children: React.ReactNode }> = ({
  n,
  children,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '.04em',
      opacity: 0.7,
      margin: '4px 0 10px',
    }}
  >
    {n != null && (
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          background: 'var(--color-surface-alt, #eee)',
        }}
      >
        {n}
      </span>
    )}
    {children}
  </div>
);
