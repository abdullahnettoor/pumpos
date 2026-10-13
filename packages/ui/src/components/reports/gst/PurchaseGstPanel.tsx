import React, { useMemo, useState } from 'react';
import { usePurchaseGstRegister } from '../../../query/hooks.js';
import { LoadingSpinner } from '../../LoadingSpinner.js';
import { inr } from '../../../utils/format.js';
import { Button, DateText, Icon } from '../../../pump-ds/index.js';
import { resolveEntryDate } from '@pump/shared';

/**
 * GST → Purchases (ITC): input credit on GST purchase lines. Moved unchanged
 * from the old Purchases "GST / ITC" tab into the one GST report (#540).
 */
export const PurchaseGstPanel: React.FC<{ selectedStation: any | null }> = ({
  selectedStation,
}) => {
  const stationId = selectedStation?.id ?? null;
  const stationSettings = selectedStation?.settings || {};
  // GST / ITC register
  // Station-timezone calendar dates, never UTC (#288).
  const gstToday = resolveEntryDate({ timeZone: stationSettings.timezone });
  const [gstFrom, setGstFrom] = useState(`${gstToday.slice(0, 8)}01`);
  const [gstTo, setGstTo] = useState(gstToday);
  // Mounted only while this GST view is showing, so the query runs only then.
  const gstQ = usePurchaseGstRegister({ from: gstFrom, to: gstTo }, stationId ?? '', {
    enabled: !!stationId,
  });
  const gstRows = useMemo(() => gstQ.data ?? [], [gstQ.data]);
  const gstLoading = gstQ.isFetching;
  const gstError = gstQ.error ? gstQ.error.message : null;

  const gstTotals = gstRows.reduce(
    (acc, r) => ({
      taxable: acc.taxable + Number(r.taxableAmount || 0),
      cgst: acc.cgst + Number(r.cgst || 0),
      sgst: acc.sgst + Number(r.sgst || 0),
      igst: acc.igst + Number(r.igst || 0),
      cess: acc.cess + Number(r.cess || 0),
      total: acc.total + Number(r.lineTotal || 0),
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
  );
  const gstItcTotal = gstTotals.cgst + gstTotals.sgst + gstTotals.igst + gstTotals.cess;

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
          Input GST credit (ITC) on GST purchase lines. Fuel (VAT) and exempt items carry no input
          credit and are excluded.
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
            From
          </label>
          <input
            type="date"
            value={gstFrom}
            onChange={(e) => setGstFrom(e.target.value)}
            className="input input-compact"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
            To
          </label>
          <input
            type="date"
            value={gstTo}
            onChange={(e) => setGstTo(e.target.value)}
            className="input input-compact"
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => void gstQ.refetch()}
          loading={gstLoading}
        >
          Apply
        </Button>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
        }}
      >
        {[
          { label: 'Taxable Value', value: gstTotals.taxable, strong: false },
          { label: 'CGST', value: gstTotals.cgst, strong: false },
          { label: 'SGST', value: gstTotals.sgst, strong: false },
          { label: 'IGST', value: gstTotals.igst, strong: false },
          { label: 'Cess', value: gstTotals.cess, strong: false },
          { label: 'Total ITC', value: gstItcTotal, strong: true },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              padding: '12px 14px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {card.label}
            </span>
            <p
              style={{
                fontSize: '16px',
                fontWeight: 700,
                marginTop: '4px',
                color: card.strong ? 'var(--brand-primary)' : 'var(--text-strong)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {inr(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Register table */}
      {gstError ? (
        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--state-danger-bg)',
            color: 'var(--state-danger-fg)',
            borderRadius: 'var(--radius-card)',
            fontSize: '12px',
          }}
        >
          {gstError}
        </div>
      ) : gstLoading ? (
        <LoadingSpinner text="Loading GST register…" />
      ) : gstRows.length === 0 ? (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          No GST purchases in this period.
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-card)',
            overflow: 'auto',
          }}
        >
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
                <th style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Supplier</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Invoice</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Product</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                  Taxable
                </th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>CGST</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>SGST</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>IGST</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {gstRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td
                    style={{
                      padding: '8px 10px',
                      whiteSpace: 'nowrap',
                      color: 'var(--text-default)',
                    }}
                  >
                    <DateText
                      value={r.entryDate ?? r.businessDate}
                      variant="compact"
                      tone="muted"
                    />
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      color: 'var(--text-strong)',
                      fontWeight: 600,
                    }}
                  >
                    {r.supplierName}
                    {r.supplierGstin && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 400,
                        }}
                      >
                        {r.supplierGstin}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-default)' }}>
                    {r.invoiceNumber || r.documentNumber || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-default)' }}>
                    {r.productName}
                    {r.productCode ? (
                      <span style={{ color: 'var(--text-muted)' }}> ({r.productCode})</span>
                    ) : null}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {Number(r.gstRate || 0)}%
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    ₹
                    {Number(r.taxableAmount || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    ₹
                    {Number(r.cgst || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    ₹
                    {Number(r.sgst || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    ₹
                    {Number(r.igst || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
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
                    ₹
                    {Number(r.lineTotal || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
