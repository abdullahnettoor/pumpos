import React, { useMemo, useRef, useState } from 'react';
import { Drawer } from '../Drawer.js';
import { useToast } from '../primitives/ToastProvider.js';
import { CloudProductService } from '../../services/cloud.js';
import type { Product } from '@pump/shared';
import { PRODUCT_UNITS } from '@pump/shared';

const productService = new CloudProductService();

const PRODUCT_TYPES = ['FUEL', 'LUBRICANT', 'ADDITIVE', 'ACCESSORY', 'CONSUMABLE', 'SPARE_PART', 'SERVICE', 'OTHER'];
const TAX_CATEGORIES = ['FUEL_VAT', 'GST', 'EXEMPT', 'NON_TAXABLE'];

// Canonical units keyed by lowercase, so a case-only difference ('l' -> 'L')
// normalizes silently without a warning.
const UNIT_BY_LOWER = new Map(PRODUCT_UNITS.map((u) => [u.value.toLowerCase(), u.value] as const));
// Common free-text spellings mapped to a curated unit. Anything not here (and
// not a canonical unit) is imported as 'Nos' with a warning so the row is never
// silently wrong nor blocked.
const UNIT_SYNONYMS: Record<string, string> = {
  ltr: 'L', ltrs: 'L', liter: 'L', liters: 'L', litre: 'L', litres: 'L',
  kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
  no: 'Nos', 'no.': 'Nos', 'nos.': 'Nos', pc: 'Nos', pcs: 'Nos', pce: 'Nos', piece: 'Nos', pieces: 'Nos',
  unit: 'Nos', units: 'Nos', ea: 'Nos', each: 'Nos', qty: 'Nos', number: 'Nos', numbers: 'Nos',
  box: 'Nos', boxes: 'Nos', set: 'Nos', sets: 'Nos', pair: 'Nos', pairs: 'Nos', meter: 'Nos', metre: 'Nos',
  bottles: 'Bottle', btl: 'Bottle', btls: 'Bottle',
  cans: 'Can', tin: 'Can', tins: 'Can',
  packets: 'Packet', pkt: 'Packet', pkts: 'Packet', pouch: 'Packet', pouches: 'Packet', sachet: 'Packet', sachets: 'Packet', pack: 'Packet', packs: 'Packet',
  service: 'Service', services: 'Service', job: 'Service', jobs: 'Service', labour: 'Service', labor: 'Service', svc: 'Service',
};

/** Resolve a free-text unit to a curated one. `known` is false when we had to
 * fall back to the default (Nos) because nothing matched. */
function normalizeUnit(raw: string): { value: string; known: boolean } {
  const key = raw.trim().toLowerCase();
  const canonical = UNIT_BY_LOWER.get(key);
  if (canonical) return { value: canonical, known: true };
  const syn = UNIT_SYNONYMS[key];
  if (syn) return { value: syn, known: true };
  return { value: 'Nos', known: false };
}

// Header columns (case-insensitive). Order in the sample; parsing maps by name.
const COLUMNS = ['name', 'code', 'productType', 'unit', 'taxCategory', 'gstRate', 'hsnCode', 'brand', 'category', 'sellingPrice', 'costPriceExGst', 'openingStock'];

const SAMPLE_CSV = [
  COLUMNS.join(','),
  'Engine Oil 20W40,LUB-2040,LUBRICANT,Bottle,GST,18,27101980,Servo,Lubricants,520,410,24',
  'Coolant 1L,LUB-COOL,LUBRICANT,Can,GST,18,38200000,,Lubricants,240,180,10',
  'Air Freshener,ACC-AF,ACCESSORY,Nos,GST,18,33074900,,Accessories,120,70,0',
].join('\n');

interface ParsedRow {
  raw: Record<string, string>;
  rowNumber: number;
  errors: string[];
  warnings: string[];
  payload: any | null;
}

interface ProductImportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  selectedStation?: any | null;
  onImported: () => void;
}

/** Split a single CSV line, honoring double-quoted fields (with "" escapes). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export const ProductImportDrawer: React.FC<ProductImportDrawerProps> = ({ isOpen, onClose, existingProducts, selectedStation, onImported }) => {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ createdCount: number; failed: { code?: string; name?: string; error: string }[] } | null>(null);

  const existingCodes = useMemo(
    () => new Set(existingProducts.map((p) => (p.code || '').toUpperCase())),
    [existingProducts],
  );

  const validCount = useMemo(() => rows.filter((r) => r.errors.length === 0).length, [rows]);
  const warningCount = useMemo(() => rows.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length, [rows]);

  const reset = () => {
    setFileName('');
    setRows([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setResult(null);
    const text = await file.text();
    setFileName(file.name);
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      setRows([]);
      toast.error('CSV has no data rows.');
      return;
    }
    const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
    const colIndex: Record<string, number> = {};
    COLUMNS.forEach((c) => { colIndex[c] = header.indexOf(c.toLowerCase()); });
    if (colIndex['name'] < 0 || colIndex['code'] < 0 || colIndex['producttype'] < 0 || colIndex['unit'] < 0) {
      toast.error('CSV must include at least: name, code, productType, unit.');
      setRows([]);
      return;
    }

    const seenCodes = new Set<string>();
    const parsed: ParsedRow[] = lines.slice(1).map((line, i) => {
      const cells = splitCsvLine(line);
      const get = (c: string) => { const idx = colIndex[c]; return idx >= 0 ? (cells[idx] ?? '').trim() : ''; };
      const raw: Record<string, string> = {};
      COLUMNS.forEach((c) => { raw[c] = get(c); });

      const errors: string[] = [];
      const warnings: string[] = [];
      const name = raw.name;
      const code = raw.code.toUpperCase();
      const productType = raw.productType.toUpperCase();
      const taxCategoryRaw = raw.taxCategory.toUpperCase();

      if (!name) errors.push('name is required');
      if (!code) errors.push('code is required');
      else if (seenCodes.has(code)) errors.push(`duplicate code "${code}" in file`);
      else if (existingCodes.has(code)) errors.push(`code "${code}" already exists`);
      if (code) seenCodes.add(code);
      if (!PRODUCT_TYPES.includes(productType)) errors.push(`invalid productType "${raw.productType}"`);
      // Unit: required, then normalized to a curated value. Synonyms map silently
      // (with a note); unrecognized free text imports as 'Nos' with a warning.
      let unit = '';
      if (!raw.unit) {
        errors.push('unit is required');
      } else {
        const norm = normalizeUnit(raw.unit);
        unit = norm.value;
        if (norm.value.toLowerCase() !== raw.unit.trim().toLowerCase()) {
          warnings.push(norm.known
            ? `unit "${raw.unit}" mapped to "${norm.value}"`
            : `unrecognized unit "${raw.unit}" — set to "${norm.value}"; adjust the product after import if needed`);
        }
      }
      const taxCategory = taxCategoryRaw || (productType === 'FUEL' ? 'FUEL_VAT' : 'GST');
      if (taxCategoryRaw && !TAX_CATEGORIES.includes(taxCategoryRaw)) errors.push(`invalid taxCategory "${raw.taxCategory}"`);

      const num = (v: string, label: string): number | null => {
        if (v === '') return null;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) { errors.push(`${label} must be a non-negative number`); return null; }
        return n;
      };
      const gstRate = num(raw.gstRate, 'gstRate');
      const sellingPrice = num(raw.sellingPrice, 'sellingPrice');
      const costPrice = num(raw.costPriceExGst, 'costPriceExGst');
      const openingStock = num(raw.openingStock, 'openingStock');

      let payload: any = null;
      if (errors.length === 0) {
        payload = {
          name,
          code,
          productType,
          unit,
          taxCategory,
          brand: raw.brand || null,
          category: raw.category || null,
          sellingPrice: sellingPrice,
          taxConfig: {
            gst_rate: gstRate ?? (taxCategory === 'GST' ? 18 : 0),
            vat_rate: 0,
            hsn_code: raw.hsnCode || '',
            price_inclusive: true,
          },
        };
        if (costPrice != null) payload.costBasis = costPrice;
        if (openingStock != null && openingStock > 0 && productType !== 'FUEL') {
          payload.openingStock = openingStock;
          payload.stationId = selectedStation?.id ?? undefined;
        }
      }
      return { raw, rowNumber: i + 2, errors, warnings, payload };
    });
    setRows(parsed);
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pumpos_products_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    const payloads = rows.filter((r) => r.errors.length === 0 && r.payload).map((r) => r.payload);
    if (payloads.length === 0) { toast.error('No valid rows to import.'); return; }
    try {
      setImporting(true);
      const res = await productService.importProducts(payloads, selectedStation?.id);
      setResult({ createdCount: res.createdCount, failed: res.failed });
      if (res.createdCount > 0) toast.success(`Imported ${res.createdCount} product${res.createdCount === 1 ? '' : 's'}.`);
      if (res.failed.length > 0) toast.error(`${res.failed.length} row${res.failed.length === 1 ? '' : 's'} failed — see details.`);
      onImported();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const cellStyle: React.CSSProperties = { padding: '6px 8px', fontSize: '12px', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' };

  return (
    <Drawer isOpen={isOpen} onClose={() => { reset(); onClose(); }} title="Import Products (CSV)" widthVariant="wide">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Upload a CSV to bulk-add products. Rows are validated here before anything is sent. Columns:
          <code style={{ display: 'block', marginTop: '6px', fontSize: '11px', color: 'var(--text-default)' }}>{COLUMNS.join(', ')}</code>
          <span style={{ fontSize: '11px' }}>Cost is entered <strong>ex-GST</strong> (pre-tax). Opening stock applies to non-fuel items and needs a selected station.</span>
          <span style={{ display: 'block', fontSize: '11px', marginTop: '4px' }}>Accepted units: <code style={{ fontSize: '11px' }}>{PRODUCT_UNITS.map((u) => u.value).join(', ')}</code>. Common spellings (pc, litre, kgs, job…) are auto-mapped; anything unrecognized imports as <code style={{ fontSize: '11px' }}>Nos</code> with a warning.</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{ height: '32px', padding: '0 14px', fontSize: '13px', fontWeight: 600, backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}
          >
            Choose CSV file
          </button>
          <button
            type="button"
            onClick={downloadSample}
            style={{ height: '32px', padding: '0 14px', fontSize: '13px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-default)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}
          >
            Download sample CSV
          </button>
          {fileName && <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'center' }}>{fileName}</span>}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        {rows.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: 600 }}>
              <span style={{ color: 'var(--state-success-fg)' }}>{validCount} valid</span>
              {warningCount > 0 && <span style={{ color: 'var(--state-warning-fg)' }}>{warningCount} with warnings</span>}
              <span style={{ color: 'var(--state-danger-fg)' }}>{rows.length - validCount} with errors</span>
              <span style={{ color: 'var(--text-muted)' }}>{rows.length} total</span>
            </div>

            <div style={{ maxHeight: '340px', overflow: 'auto', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left', position: 'sticky', top: 0 }}>
                    {['#', 'Name', 'Code', 'Type', 'Status'].map((h) => (
                      <th key={h} style={{ ...cellStyle, fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} style={{ backgroundColor: r.errors.length ? 'var(--state-danger-bg)' : r.warnings.length ? 'var(--state-warning-bg)' : 'transparent' }}>
                      <td style={{ ...cellStyle, color: 'var(--text-muted)' }}>{r.rowNumber}</td>
                      <td style={{ ...cellStyle, color: 'var(--text-strong)' }}>{r.raw.name || '—'}</td>
                      <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)' }}>{r.raw.code || '—'}</td>
                      <td style={{ ...cellStyle }}>{r.raw.productType || '—'}</td>
                      <td style={{ ...cellStyle, whiteSpace: 'normal', color: r.errors.length ? 'var(--state-danger-fg)' : r.warnings.length ? 'var(--state-warning-fg)' : 'var(--state-success-fg)' }}>
                        {r.errors.length ? r.errors.join('; ') : r.warnings.length ? r.warnings.join('; ') : 'OK'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result && (
              <div style={{ fontSize: '12px', padding: '10px 12px', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-surface-alt)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>Imported {result.createdCount} of {rows.length} rows.</div>
                {result.failed.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: 'var(--state-danger-fg)' }}>
                    {result.failed.map((f, i) => <li key={i}>{f.code || f.name || 'row'}: {f.error}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={reset}
                style={{ height: '34px', padding: '0 16px', fontSize: '13px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-default)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)', cursor: 'pointer' }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={runImport}
                disabled={importing || validCount === 0}
                style={{ height: '34px', padding: '0 16px', fontSize: '13px', fontWeight: 600, backgroundColor: validCount === 0 ? 'var(--border-strong)' : 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-input)', cursor: validCount === 0 ? 'not-allowed' : 'pointer', opacity: importing ? 0.7 : 1 }}
              >
                {importing ? 'Importing…' : `Import ${validCount} product${validCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
};
