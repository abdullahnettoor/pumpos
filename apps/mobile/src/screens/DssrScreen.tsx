import React, { useState } from 'react';
import { useDailyDssrPreview, generateDssrPdf, inr } from '@pump/ui';
import { resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { ShareButton } from '../components/ShareButton.js';

interface Props {
  station: Station;
  /** Business day selected by the global pill (YYYY-MM-DD). */
  businessDate: string | null;
}

const numberFmt = (n: number, dec = 2) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}>
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{title}</h3>
    {children}
  </section>
);

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-center justify-between text-sm">
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <span className="font-mono tabular-nums" style={{ color: strong ? 'var(--text-strong)' : 'var(--text-default)', fontWeight: strong ? 600 : 400 }}>
      {value}
    </span>
  </div>
);

const varColor = (v: number) =>
  Math.abs(v) < 50 ? 'var(--text-faint)' : Math.abs(v) < 200 ? 'var(--state-warning-fg)' : 'var(--state-danger-fg)';

/**
 * DSSR — the formal Daily Station Sales Report (the report of record). Distinct
 * from the Home cockpit: this is the full sectioned breakdown for reading and
 * sharing as a PDF, not an at-a-glance KPI view.
 */
export const DssrScreen: React.FC<Props> = ({ station, businessDate }) => {
  const settings: any = (station as any).settings || {};
  const todayBiz = resolveBusinessDate({
    timeZone: settings.timezone,
    dayStartsAt: settings.business_day_starts_at,
  });
  const date = businessDate ?? todayBiz;

  const q = useDailyDssrPreview(station.id, date);
  const snapshot: any = q.data?.snapshotData ?? q.data ?? {};
  const fuel = snapshot.fuel || {};
  const merchandise = snapshot.merchandise || {};
  const collections = snapshot.collections || {};
  const credit = snapshot.credit || {};
  const expenses = snapshot.expenses || {};
  const purchases = snapshot.purchases || {};
  const pnl = snapshot.pnl || {};
  const byProduct: any[] = fuel.byProduct || [];
  const shifts: any[] = snapshot.shifts || [];
  const hasCostBasis = Number(pnl.cogs || 0) > 0;

  const [error, setError] = useState<string | null>(null);
  const shareDssr = () =>
    generateDssrPdf(station, { snapshotData: snapshot, businessDate: date, generatedAt: new Date().toISOString() });

  return (
    <div className="flex flex-col gap-4">
      {q.isLoading ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : q.isError ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--state-danger-fg)' }}>
          Could not load the report for this date.
        </p>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Daily report</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {date}
                {date === todayBiz ? ' · live preview' : ''} · {shifts.length} shift{shifts.length === 1 ? '' : 's'}
              </p>
            </div>
            <ShareButton label="PDF" onShare={shareDssr} onError={setError} />
          </div>
          {error && <p className="text-center text-xs" style={{ color: 'var(--state-danger-fg)' }}>{error}</p>}

          {/* Financial summary */}
          <Section title="Financial summary">
            <div className="flex flex-col gap-2">
              <Row
                label={`Fuel sales · ${numberFmt(Number(fuel.totalNetVolume ?? fuel.totalVolume ?? 0))} L`}
                value={inr(Number(fuel.totalSalesValue || 0))}
                strong
              />
              {Number(merchandise.salesValue || 0) > 0 && (
                <Row label="Merchandise sales" value={inr(Number(merchandise.salesValue || 0))} />
              )}
              <Row label="Collections" value={inr(Number(collections.total || 0))} />
              <Row label="Credit sales (receivable)" value={inr(Number(credit.total || 0))} />
              <Row label="Expenses" value={inr(Number(expenses.total || 0))} />
              <Row label="Purchases" value={inr(Number(purchases.total || 0))} />
              {hasCostBasis && (
                <div className="mt-1 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                  <Row label="Net profit (after COGS)" value={inr(Number(pnl.netProfit || 0))} strong />
                </div>
              )}
            </div>
          </Section>

          {/* Collections by mode */}
          <Section title="Collections by mode">
            <div className="flex flex-col gap-2">
              {([['Cash', collections.Cash], ['Card', collections.Card], ['UPI', collections.UPI], ['Bank transfer', collections.BankTransfer]] as const).map(
                ([label, val]) => <Row key={label} label={label} value={inr(Number(val || 0))} />,
              )}
            </div>
          </Section>

          {/* Fuel sales by product */}
          {byProduct.length > 0 && (
            <Section title="Fuel sales by product">
              <div className="flex flex-col gap-2">
                {byProduct.map((p, i) => (
                  <div key={p.productId ?? i} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="truncate" style={{ color: 'var(--text-default)' }}>{p.productName}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {numberFmt(Number(p.netVolume || 0))} {p.unit || 'L'} net
                      </p>
                    </div>
                    <span className="font-mono tabular-nums" style={{ color: 'var(--text-strong)' }}>
                      {inr(Number(p.salesValue || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Included shifts */}
          {shifts.length > 0 && (
            <Section title="Included shifts">
              <div className="flex flex-col gap-2">
                {shifts.map((s, i) => {
                  const v = Number(s.cashVariance || 0);
                  return (
                    <div key={s.shiftId ?? i} className="flex items-center justify-between text-sm">
                      <div>
                        <p style={{ color: 'var(--text-default)' }}>{s.templateName || 'Shift'}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                          {numberFmt(Number(s.netVolume || 0))} L net
                        </p>
                      </div>
                      <span className="font-mono text-xs tabular-nums" style={{ color: varColor(v) }}>
                        Var {inr(v)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
};
