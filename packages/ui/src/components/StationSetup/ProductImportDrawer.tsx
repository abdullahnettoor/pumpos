import React, { useMemo, useRef, useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Button, Chip, Icon, InteractiveTable, type TableColumn } from '../../pump-ds/index.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { officeSubmitKeys, sendKeyed } from '../../office-records/submitKeys.js';
import { CloudProductService } from '../../services/cloud.js';
import type { Product } from '@pump/shared';
import { PRODUCT_UNITS } from '@pump/shared';

const productService = new CloudProductService();

const PRODUCT_TYPES = [
  'FUEL',
  'LUBRICANT',
  'ADDITIVE',
  'ACCESSORY',
  'CONSUMABLE',
  'SPARE_PART',
  'SERVICE',
  'OTHER',
];
const TAX_CATEGORIES = ['FUEL_VAT', 'GST', 'EXEMPT', 'NON_TAXABLE'];

// Canonical units keyed by lowercase, so a case-only difference ('l' -> 'L')
// normalizes silently without a warning.
const UNIT_BY_LOWER = new Map(PRODUCT_UNITS.map((u) => [u.value.toLowerCase(), u.value] as const));
// Common free-text spellings mapped to a curated unit. Anything not here (and
// not a canonical unit) is imported as 'Nos' with a warning so the row is never
// silently wrong nor blocked.
const UNIT_SYNONYMS: Record<string, string> = {
  ltr: 'L',
  ltrs: 'L',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
  no: 'Nos',
  'no.': 'Nos',
  'nos.': 'Nos',
  pc: 'Nos',
  pcs: 'Nos',
  pce: 'Nos',
  piece: 'Nos',
  pieces: 'Nos',
  unit: 'Nos',
  units: 'Nos',
  ea: 'Nos',
  each: 'Nos',
  qty: 'Nos',
  number: 'Nos',
  numbers: 'Nos',
  box: 'Nos',
  boxes: 'Nos',
  set: 'Nos',
  sets: 'Nos',
  pair: 'Nos',
  pairs: 'Nos',
  meter: 'Nos',
  metre: 'Nos',
  bottles: 'Bottle',
  btl: 'Bottle',
  btls: 'Bottle',
  cans: 'Can',
  tin: 'Can',
  tins: 'Can',
  packets: 'Packet',
  pkt: 'Packet',
  pkts: 'Packet',
  pouch: 'Packet',
  pouches: 'Packet',
  sachet: 'Packet',
  sachets: 'Packet',
  pack: 'Packet',
  packs: 'Packet',
  service: 'Service',
  services: 'Service',
  job: 'Service',
  jobs: 'Service',
  labour: 'Service',
  labor: 'Service',
  svc: 'Service',
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
const COLUMNS = [
  'name',
  'code',
  'productType',
  'unit',
  'taxCategory',
  'gstRate',
  'hsnCode',
  'brand',
  'category',
  'sellingPrice',
  'costPriceExGst',
  'openingStock',
];

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

const Faint: React.FC = () => <span className="text-ink-faint">—</span>;

const rowStatus = (r: ParsedRow) =>
  r.errors.length ? r.errors.join('; ') : r.warnings.length ? r.warnings.join('; ') : 'OK';

const PREVIEW_COLUMNS: TableColumn<ParsedRow>[] = [
  {
    id: 'row',
    header: '#',
    kind: 'text',
    width: '6%',
    value: (r) => r.rowNumber,
    cell: (r) => <span className="text-ink-muted">{r.rowNumber}</span>,
  },
  {
    id: 'name',
    header: 'Name',
    kind: 'text',
    value: (r) => r.raw.name,
    cell: (r) => (r.raw.name ? <span className="text-ink-strong">{r.raw.name}</span> : <Faint />),
  },
  {
    id: 'code',
    header: 'Code',
    kind: 'text',
    value: (r) => r.raw.code,
    cell: (r) => (r.raw.code ? <span className="font-mono">{r.raw.code}</span> : <Faint />),
  },
  {
    id: 'type',
    header: 'Type',
    kind: 'text',
    value: (r) => r.raw.productType,
    cell: (r) =>
      r.raw.productType ? (
        <Chip tone="neutral" size="md">
          {r.raw.productType}
        </Chip>
      ) : (
        <Faint />
      ),
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'text',
    width: '40%',
    value: rowStatus,
    cell: (r) => (
      <span
        className={
          r.errors.length
            ? 'whitespace-normal text-danger-fg'
            : r.warnings.length
              ? 'whitespace-normal text-warning-fg'
              : 'text-success-fg'
        }
      >
        {rowStatus(r)}
      </span>
    ),
  },
];

interface ProductImportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  selectedStation?: any | null;
  /**
   * Called once the import has landed. Synchronous on purpose: refresh the
   * list in the background, so a failed refresh is never read as a failed
   * import.
   */
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
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
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

export const ProductImportDrawer: React.FC<ProductImportDrawerProps> = ({
  isOpen,
  onClose,
  existingProducts,
  selectedStation,
  onImported,
}) => {
  const toast = useToast();
  const runTask = useRunTask();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    createdCount: number;
    failed: { code?: string; name?: string; error: string }[];
  } | null>(null);

  const existingCodes = useMemo(
    () => new Set(existingProducts.map((p) => (p.code || '').toUpperCase())),
    [existingProducts],
  );

  const validCount = useMemo(() => rows.filter((r) => r.errors.length === 0).length, [rows]);
  const warningCount = useMemo(
    () => rows.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length,
    [rows],
  );

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
      toast.error(
        withNextStep('The CSV has no data rows', 'Add rows under the header and upload it again.'),
      );
      return;
    }
    const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
    const colIndex: Record<string, number> = {};
    COLUMNS.forEach((c) => {
      colIndex[c] = header.indexOf(c.toLowerCase());
    });
    if (
      colIndex['name'] < 0 ||
      colIndex['code'] < 0 ||
      colIndex['producttype'] < 0 ||
      colIndex['unit'] < 0
    ) {
      toast.error(
        withNextStep(
          'The CSV must include at least: name, code, productType, unit',
          'Add the missing columns and upload it again.',
        ),
      );
      setRows([]);
      return;
    }

    const seenCodes = new Set<string>();
    const parsed: ParsedRow[] = lines.slice(1).map((line, i) => {
      const cells = splitCsvLine(line);
      const get = (c: string) => {
        const idx = colIndex[c];
        return idx >= 0 ? (cells[idx] ?? '').trim() : '';
      };
      const raw: Record<string, string> = {};
      COLUMNS.forEach((c) => {
        raw[c] = get(c);
      });

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
      if (!PRODUCT_TYPES.includes(productType))
        errors.push(`invalid productType "${raw.productType}"`);
      // Unit: required, then normalized to a curated value. Synonyms map silently
      // (with a note); unrecognized free text imports as 'Nos' with a warning.
      let unit = '';
      if (!raw.unit) {
        errors.push('unit is required');
      } else {
        const norm = normalizeUnit(raw.unit);
        unit = norm.value;
        if (norm.value.toLowerCase() !== raw.unit.trim().toLowerCase()) {
          warnings.push(
            norm.known
              ? `unit "${raw.unit}" mapped to "${norm.value}"`
              : `unrecognized unit "${raw.unit}" — set to "${norm.value}"; adjust the product after import if needed`,
          );
        }
      }
      const taxCategory = taxCategoryRaw || (productType === 'FUEL' ? 'FUEL_VAT' : 'GST');
      if (taxCategoryRaw && !TAX_CATEGORIES.includes(taxCategoryRaw))
        errors.push(`invalid taxCategory "${raw.taxCategory}"`);

      const num = (v: string, label: string): number | null => {
        if (v === '') return null;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) {
          errors.push(`${label} must be a non-negative number`);
          return null;
        }
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
    if (payloads.length === 0) {
      toast.error(
        withNextStep('No valid rows to import', 'Fix the rows marked in the preview, then import.'),
      );
      return;
    }
    const stationId = selectedStation?.id;
    let res: Awaited<ReturnType<typeof productService.importProducts>>;
    try {
      setImporting(true);
      res = await sendKeyed(
        officeSubmitKeys.session('setup:products:import'),
        { products: payloads, stationId },
        (idempotencyKey) => productService.importProducts(payloads, stationId, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(
        withNextStep(err.message || 'The import failed', 'Check the file and import again.'),
      );
      return;
    } finally {
      setImporting(false);
    }
    // Reported outside the try: the import has landed, so nothing after this
    // point may surface as "Import failed".
    setResult({ createdCount: res.createdCount, failed: res.failed });
    if (res.createdCount > 0)
      toast.success(`Imported ${res.createdCount} product${res.createdCount === 1 ? '' : 's'}.`);
    if (res.failed.length > 0)
      toast.error(
        withNextStep(
          `${res.failed.length} row${res.failed.length === 1 ? '' : 's'} failed`,
          'See the details below, fix them and import those rows again.',
        ),
      );
    onImported();
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import products (CSV)"
      widthVariant="wide"
    >
      <div className="flex flex-col gap-4">
        <div className="text-[13px] leading-normal text-ink-muted">
          Upload a CSV to bulk-add products. Rows are validated here before anything is sent.
          Columns:
          <code className="mt-1.5 block text-[12px] text-ink">{COLUMNS.join(', ')}</code>
          <span className="text-[12px]">
            Cost is entered <strong>ex-GST</strong> (pre-tax). Opening stock applies to non-fuel
            items and needs a selected station.
          </span>
          <span className="mt-1 block text-[12px]">
            Accepted units: <code>{PRODUCT_UNITS.map((u) => u.value).join(', ')}</code>. Common
            spellings (pc, litre, kgs, job…) are auto-mapped; anything unrecognized imports as{' '}
            <code>Nos</code> with a warning.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="primary"
            leftIcon={<Icon name="upload" size="sm" />}
            onClick={() => fileRef.current?.click()}
          >
            Choose CSV file
          </Button>
          <Button
            type="button"
            variant="secondary"
            leftIcon={<Icon name="download" size="sm" />}
            onClick={downloadSample}
          >
            Download sample CSV
          </Button>
          {fileName && <span className="text-[12px] text-ink-muted">{fileName}</span>}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runTask(handleFile(f), 'Could not read that CSV file.');
            }}
          />
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex gap-4 text-[12px] font-semibold">
              <span className="text-success-fg">{validCount} valid</span>
              {warningCount > 0 && (
                <span className="text-warning-fg">{warningCount} with warnings</span>
              )}
              <span className="text-danger-fg">{rows.length - validCount} with errors</span>
              <span className="text-ink-muted">{rows.length} total</span>
            </div>

            <div className="max-h-[340px] overflow-auto">
              <InteractiveTable
                columns={PREVIEW_COLUMNS}
                rows={rows}
                rowKey={(r) => String(r.rowNumber)}
                title="import preview"
              />
            </div>

            {result && (
              <div className="rounded-md bg-surface-alt px-3 py-2.5 text-[12px]">
                <div className="font-semibold text-ink-strong">
                  Imported {result.createdCount} of {rows.length} rows.
                </div>
                {result.failed.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-[18px] text-danger-fg">
                    {result.failed.map((f, i) => (
                      <li key={i}>
                        {f.code || f.name || 'row'}: {f.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2.5">
              <Button type="button" variant="secondary" onClick={reset}>
                Clear
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => runTask(runImport(), 'Could not import the products.')}
                disabled={importing || validCount === 0}
              >
                {importing
                  ? 'Importing…'
                  : `Import ${validCount} product${validCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
};
