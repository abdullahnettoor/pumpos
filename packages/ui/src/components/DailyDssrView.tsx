import React from 'react';
import { ArrowLeft, Printer, Download, AlertTriangle } from 'lucide-react';
import { exportReactPdf } from '../services/exportPdf.js';
import { DEFAULT_DSSR_CONFIG, paperFromStation } from '../services/reports/reportConfig.js';
import { letterheadFromStation } from '../services/reports/letterhead.js';
import { Button } from '../pump-ds/index.js';
import { formatDateTime } from '../utils/format.js';

interface DailyDssrViewProps {
  dailyDssr: any;
  onBack?: () => void;
  station?: any;
}

export const DailyDssrView: React.FC<DailyDssrViewProps> = ({ dailyDssr, onBack, station }) => {
  const printRef = React.useRef<HTMLDivElement>(null);
  const snapshot = dailyDssr?.snapshotData || {};

  const fuel = snapshot.fuel || {};
  const byProduct = (fuel.byProduct || []) as Array<any>;
  const nozzles = (fuel.nozzles || []) as Array<any>;
  const collections = snapshot.collections || {};
  const credit = snapshot.credit || {};
  const merchandise = snapshot.merchandise || {};
  const expenses = snapshot.expenses || {};
  const purchases = snapshot.purchases || {};
  const supplierPayments = snapshot.supplierPayments || {};
  const fuelStockVariance = (snapshot.fuelStockVariance || []) as Array<any>;
  const merchandiseStockVariance = (snapshot.merchandiseStockVariance || []) as Array<any>;
  const shifts = snapshot.shifts || [];
  const warnings = snapshot.warnings || [];

  const totalGrossVolume = Number(fuel.totalGrossVolume ?? fuel.totalVolume ?? 0);
  const totalTestingVolume = Number(fuel.totalTestingVolume || 0);
  const totalNetVolume = Number(fuel.totalNetVolume ?? totalGrossVolume - totalTestingVolume);
  const totalFuelSalesValue = Number(fuel.totalSalesValue || 0);
  const totalCashCollections = Number(collections.Cash || 0);
  const totalCardCollections = Number(collections.Card || 0);
  const totalUpiCollections = Number(collections.UPI || 0);
  const totalBankCollections = Number(collections.BankTransfer || 0);
  const totalCollections = Number(collections.total || 0);
  const normalCredit = Number(credit.normalCredit || 0);
  const fleetCredit = Number(credit.fleetCredit || 0);
  const totalExpenses = Number(expenses.total || 0);
  const pnl = snapshot.pnl || {};
  const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div ref={printRef} className="card card-comfortable print-area" style={{ maxWidth: '920px', margin: '0 auto' }}>
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-soft)',
          paddingBottom: '16px',
        }}
      >
        <Button variant="secondary" size="sm" leftIcon={<ArrowLeft />} onClick={onBack}>
          Back to Reports
        </Button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" size="sm" leftIcon={<Download />} onClick={async () => {
            const [{ exportReactPdf }, doc] = await Promise.all([
              import('../services/exportPdf.js'),
              import('../services/reports/dssrDoc.js'),
            ]);
            const sections = station?.settings?.report_config?.dssr?.length ? station.settings.report_config.dssr : DEFAULT_DSSR_CONFIG.sections;
            const config = { ...DEFAULT_DSSR_CONFIG, sections: sections as any, stationName: station?.name, letterhead: letterheadFromStation(station), paper: paperFromStation(station) };
            await exportReactPdf(React.createElement(doc.DssrDoc, { dssr: dailyDssr, config }), `Daily_DSSR_${dailyDssr?.businessDate || ''}`);
          }}>
            Save PDF
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<Printer />} onClick={() => window.print()}>
            Print Daily DSSR
          </Button>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-strong)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Daily Sales Summary Record
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
          Business Date {dailyDssr.businessDate} • Generated {formatDateTime(dailyDssr.generatedAt)}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          padding: '20px',
          backgroundColor: 'var(--bg-surface-alt)',
          borderRadius: 'var(--radius-input)',
          marginBottom: '24px',
          border: '1px solid var(--border-soft)',
        }}
      >
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            Shifts Included
          </span>
          <strong style={{ fontSize: '16px', color: 'var(--text-strong)' }}>{snapshot.shiftsIncluded || 0}</strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            Net Fuel Volume
          </span>
          <strong style={{ fontSize: '16px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
            {totalNetVolume.toFixed(3)} L
          </strong>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)' }}>
            Gross {totalGrossVolume.toFixed(3)} − Testing {totalTestingVolume.toFixed(3)}
          </span>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            Fuel Sales Value
          </span>
          <strong style={{ fontSize: '16px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
            {inr(totalFuelSalesValue)}
          </strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Collections
          </span>
          <strong style={{ fontSize: '16px', color: 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
            {inr(totalCollections)}
          </strong>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)' }}>
            Cash {inr(totalCashCollections)} · Non-cash {inr(totalCardCollections + totalUpiCollections + totalBankCollections)}
          </span>
        </div>
      </div>

      {warnings.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--state-warning-bg)',
            color: 'var(--state-warning-fg)',
            padding: '16px',
            borderRadius: 'var(--radius-input)',
            marginBottom: '24px',
            fontSize: '12px',
            border: '1px solid var(--border-soft)',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '6px' }}>
            <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> Daily Warnings
          </strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {warnings.map((warn: string, idx: number) => (
              <li key={idx} style={{ marginTop: '4px' }}>
                {warn}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Profitability (P&amp;L)
      </h3>
      <div
        style={{
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-input)',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '13px',
          overflow: 'hidden',
          marginBottom: '8px',
        }}
      >
        {([
          { label: 'Revenue — Fuel', value: inr(Number(pnl.revenueFuel || 0)) },
          { label: 'Revenue — Merchandise', value: inr(Number(pnl.revenueMerch || 0)) },
          { label: 'Total Revenue', value: inr(Number(pnl.revenue || 0)), strong: true },
          { label: 'COGS — Fuel', value: `(${inr(Number(pnl.cogsFuel || 0))})`, color: 'var(--brand-warning)' },
          { label: 'COGS — Merchandise', value: `(${inr(Number(pnl.cogsMerch || 0))})`, color: 'var(--brand-warning)' },
          { label: 'Gross Margin', value: inr(Number(pnl.grossMargin || 0)), strong: true },
          { label: 'Operating Expenses', value: `(${inr(Number(pnl.expenses ?? totalExpenses))})`, color: 'var(--brand-warning)' },
        ] as Array<{ label: string; value: string; color?: string; strong?: boolean }>).map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border-soft)', backgroundColor: r.strong ? 'var(--bg-surface-alt)' : 'transparent' }}>
            <span style={{ fontWeight: r.strong ? 700 : 400 }}>{r.label}</span>
            <span style={{ fontWeight: r.strong ? 700 : 600, fontFamily: 'var(--font-mono)', color: r.color || 'var(--text-default)' }}>{r.value}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 16px', backgroundColor: 'var(--bg-surface-alt)' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Net Profit</span>
          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '15px', color: Number(pnl.netProfit || 0) < 0 ? 'var(--state-danger-fg)' : 'var(--state-success-fg)' }}>
            {inr(Number(pnl.netProfit || 0))}
          </span>
        </div>
      </div>
      <p style={{ fontSize: '10px', color: 'var(--text-faint)', marginBottom: '24px' }}>
        COGS uses each product&apos;s weighted-average cost at day close. Fuel VAT is output tax (excluded from cost); merchandise cost is pre-tax.
      </p>

      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Financial Summary
      </h3>
      <div
        style={{
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-input)',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '13px',
          overflow: 'hidden',
          marginBottom: '28px',
        }}
      >
        {([
          { label: 'Cash Collections', value: inr(totalCashCollections) },
          { label: 'Card Collections', value: inr(totalCardCollections) },
          { label: 'UPI Collections', value: inr(totalUpiCollections) },
          { label: 'Bank Transfer Collections', value: inr(totalBankCollections) },
          { label: 'Merchandise Sales', value: inr(Number(merchandise.salesValue || 0)) },
          { label: 'Normal Credit Sales', value: inr(normalCredit), color: 'var(--brand-warning)' },
          { label: 'Fleet Credit Sales', value: inr(fleetCredit), color: 'var(--brand-warning)' },
          { label: 'Purchases', value: inr(Number(purchases.total || 0)) },
          { label: 'Supplier Payments (Drawer / Bank)', value: `${inr(Number(supplierPayments.drawer || 0))} / ${inr(Number(supplierPayments.bank || 0))}` },
          { label: 'Drawer Expenses', value: inr(Number(expenses.drawer || 0)) },
          { label: 'Business Expenses', value: inr(Number(expenses.business || 0)) },
        ] as Array<{ label: string; value: string; color?: string }>).map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border-soft)' }}>
            <span>{r.label}</span>
            <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: r.color || 'var(--text-default)' }}>{r.value}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'var(--bg-surface-alt)' }}>
          <span style={{ fontWeight: 700 }}>Total Expenses</span>
          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-danger)' }}>{inr(totalExpenses)}</span>
        </div>
      </div>

      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Fuel Sales by Product
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Product</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Gross (L)</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Testing (L)</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Net (L)</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Sales Value</th>
          </tr>
        </thead>
        <tbody>
          {byProduct.length > 0 ? (
            byProduct.map((p: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>{p.productName || 'Unknown'}{p.productCode ? ` (${p.productCode})` : ''}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(p.grossVolume || 0).toFixed(3)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: Number(p.testingVolume || 0) > 0 ? 'var(--brand-warning)' : 'var(--text-muted)' }}>{Number(p.testingVolume || 0).toFixed(3)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{Number(p.netVolume || 0).toFixed(3)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{inr(Number(p.salesValue || 0))}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>No fuel sales in this daily DSSR.</td>
            </tr>
          )}
          <tr style={{ borderTop: '2px solid var(--border-strong)', backgroundColor: 'var(--bg-surface-alt)', fontWeight: 700 }}>
            <td style={{ padding: '10px 12px', textTransform: 'uppercase', fontSize: '11px', color: 'var(--text-muted)' }}>Total</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{totalGrossVolume.toFixed(3)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{totalTestingVolume.toFixed(3)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)', fontSize: '14px' }}>{totalNetVolume.toFixed(3)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(totalFuelSalesValue)}</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Nozzle Aggregation
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nozzle</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Product</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Gross (L)</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Testing (L)</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Net (L)</th>
          </tr>
        </thead>
        <tbody>
          {nozzles.length > 0 ? (
            nozzles.map((nz: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>{nz.nozzleName || 'Unknown'}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-default)' }}>{nz.productName || 'Unknown'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(nz.grossVolume || 0).toFixed(3)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: Number(nz.testingVolume || 0) > 0 ? 'var(--brand-warning)' : 'var(--text-muted)' }}>{Number(nz.testingVolume || 0).toFixed(3)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{Number(nz.netVolume || 0).toFixed(3)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>No nozzle data in this daily DSSR.</td>
            </tr>
          )}
        </tbody>
      </table>

      {fuelStockVariance.length > 0 && (
        <>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            Tank Dip & Fuel Stock Variance <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-muted)', fontSize: '12px' }}>(Litres)</span>
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Tank</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Product</th>
                <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Book (L)</th>
                <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Dip (L)</th>
                <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Variance (L)</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {fuelStockVariance.map((v: any, idx: number) => {
                const variance = Number(v.varianceQuantity || 0);
                const varColor = variance < 0 ? 'var(--brand-danger)' : variance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>{v.tankName || 'Unknown'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-default)' }}>{v.productName || 'Unknown'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(v.expectedQuantity || 0).toFixed(3)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(v.actualQuantity || 0).toFixed(3)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: varColor }}>{variance > 0 ? '+' : ''}{variance.toFixed(3)}</td>
                    <td style={{ padding: '10px 12px', color: varColor, fontWeight: 600 }}>{v.status || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {merchandiseStockVariance.length > 0 && (
        <>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            Merchandise Stock Variance <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-muted)', fontSize: '12px' }}>(Units)</span>
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Product</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Unit</th>
                <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Book</th>
                <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Counted</th>
                <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Variance</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {merchandiseStockVariance.map((v: any, idx: number) => {
                const variance = Number(v.varianceQuantity || 0);
                const varColor = variance < 0 ? 'var(--brand-danger)' : variance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>{v.productName || 'Unknown'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{v.unit || '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(v.expectedQuantity || 0).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(v.actualQuantity || 0).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: varColor }}>{variance > 0 ? '+' : ''}{Number(variance).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 12px', color: varColor, fontWeight: 600 }}>{v.status || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Included Shifts
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Shift ID</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Template</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Closed At</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Net Volume (L)</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Cash Variance (₹)</th>
          </tr>
        </thead>
        <tbody>
          {shifts.length > 0 ? (
            shifts.map((shift: any, idx: number) => {
              const variance = Number(shift.cashVariance || 0);
              const varColor = variance < 0 ? 'var(--brand-danger)' : variance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
              return (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                    {(shift.shiftId || '').slice(0, 8)}...
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-default)' }}>{shift.templateName || 'Custom'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-default)' }}>
                    {shift.closedAt ? new Date(shift.closedAt).toLocaleString('en-IN') : '-'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(shift.netVolume || 0).toFixed(3)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: varColor, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {variance > 0 ? '+' : ''}{variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={5} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No shifts were included for this day.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
