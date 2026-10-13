import React, { useMemo, useState } from 'react';
import { useIncomeGstRegister } from '../../../query/hooks.js';
import { DateRangeField, computeRange } from '../../primitives/DateRangeField.js';
import type { DateRange } from '../../primitives/DateRangeField.js';
import { LoadingSpinner } from '../../LoadingSpinner.js';
import { inr } from '../../../utils/format.js';
import {
  Panel,
  Button,
  KpiStrip,
  KpiTile,
  EmptyState,
  DateText,
  Icon,
} from '../../../pump-ds/index.js';

/**
 * GST → Income: output GST collected on other income. Moved unchanged from the
 * old Income "GST on Income" tab into the one GST report (#540).
 */
export const IncomeGstPanel: React.FC<{ selectedStation: any | null }> = ({ selectedStation }) => {
  const stationId = selectedStation?.id ?? null;
  const s = selectedStation?.settings || {};
  // Office records are dated by entry date: the plain station calendar date (ADR 0005).
  const entryClock = useMemo(() => ({ timeZone: s.timezone }), [s.timezone]);

  // FI4 — output GST register. Read straight from the API (not the tiered cache):
  // it is a period report driven by its own date inputs, not the ledger range.
  const [gstRange, setGstRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  // Mounted only while this GST view is showing, so the query runs only then.
  const gstQ = useIncomeGstRegister(
    { stationId, from: gstRange.from, to: gstRange.to },
    { enabled: !!stationId },
  );
  const gstRows = useMemo(() => gstQ.data ?? [], [gstQ.data]);
  const gstLoading = gstQ.isFetching;
  const gstError = gstQ.error ? gstQ.error.message : null;

  const gstTotals = useMemo(
    () =>
      gstRows.reduce(
        (acc, r) => ({
          taxable: acc.taxable + Number(r.taxableAmount || 0),
          cgst: acc.cgst + Number(r.cgst || 0),
          sgst: acc.sgst + Number(r.sgst || 0),
          igst: acc.igst + Number(r.igst || 0),
          cess: acc.cess + Number(r.cess || 0),
          gross: acc.gross + Number(r.amount || 0),
        }),
        { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, gross: 0 },
      ),
    [gstRows],
  );
  const gstOutputTotal = gstTotals.cgst + gstTotals.sgst + gstTotals.igst + gstTotals.cess;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        style={{
          backgroundColor: 'var(--state-info-bg)',
          color: 'var(--state-info-fg)',
          padding: '10px 12px',
          borderRadius: 'var(--radius-card)',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          border: '1px solid var(--border-soft)',
        }}
      >
        <Icon name="info" size="xs" />
        <span>
          Output GST you collected on other income (rentals, commissions, advertising). The split is
          frozen from the category&rsquo;s GST rate at the time each entry was recorded. Voided
          entries are excluded.
        </span>
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <DateRangeField value={gstRange} onChange={setGstRange} clock={entryClock} size="sm" />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void gstQ.refetch()}
          loading={gstLoading}
        >
          Apply
        </Button>
      </div>

      <KpiStrip columns="auto">
        <KpiTile label="Taxable Value" value={inr(gstTotals.taxable)} hint="net of GST" />
        <KpiTile label="CGST" value={inr(gstTotals.cgst)} />
        <KpiTile label="SGST" value={inr(gstTotals.sgst)} />
        <KpiTile label="IGST" value={inr(gstTotals.igst)} />
        <KpiTile
          dot="brand"
          valueTone="brand"
          label="Output GST"
          value={inr(gstOutputTotal)}
          hint={`${gstRows.length} ${gstRows.length === 1 ? 'entry' : 'entries'}`}
        />
      </KpiStrip>

      <Panel flush title="GST register">
        {gstError ? (
          <div
            style={{
              padding: '12px',
              color: 'var(--state-danger-fg)',
              backgroundColor: 'var(--state-danger-bg)',
              fontSize: '12px',
            }}
          >
            {gstError}
          </div>
        ) : gstLoading ? (
          <div style={{ padding: '16px' }}>
            <LoadingSpinner text="Loading GST register…" />
          </div>
        ) : gstRows.length === 0 ? (
          <div style={{ padding: '12px' }}>
            <EmptyState
              compact
              icon={<Icon name="percent" size="md" />}
              title="No GST income in this period"
              description="Income only appears here when its category carries a GST rate."
            />
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    borderBottom: '1px solid var(--border-soft)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <th style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Date
                  </th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Payer / Description</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Rate</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                    Taxable
                  </th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>CGST</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>SGST</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>IGST</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                    Received
                  </th>
                </tr>
              </thead>
              <tbody>
                {gstRows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <DateText value={r.entryDate} variant="compact" tone="muted" />
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        color: 'var(--text-strong)',
                        fontWeight: 600,
                      }}
                    >
                      {r.categoryName}
                      {r.hsnCode && (
                        <div
                          style={{
                            fontSize: '10px',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 400,
                          }}
                        >
                          HSN/SAC {r.hsnCode}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-default)' }}>
                      {r.payer || r.description || '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {Number(r.gstRate || 0)}%{r.interState ? ' · IGST' : ''}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(Number(r.taxableAmount || 0))}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(Number(r.cgst || 0))}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(Number(r.sgst || 0))}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(Number(r.igst || 0))}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: 'var(--text-strong)',
                      }}
                    >
                      {inr(Number(r.amount || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    fontWeight: 700,
                    color: 'var(--text-strong)',
                  }}
                >
                  <td style={{ padding: '8px 10px' }} colSpan={4}>
                    Total
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(gstTotals.taxable)}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(gstTotals.cgst)}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(gstTotals.sgst)}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(gstTotals.igst)}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(gstTotals.gross)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};
