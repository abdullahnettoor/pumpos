// PROTOTYPE — throwaway. Variant E: accordion stepper with one Decantation per
// tanker visit and one or more TANK LINES (split unloading). Chambers say which
// tank line they emptied into. Stock/variance are per line.
import React, { useMemo, useState } from 'react';
import { Button, Chip, Icon } from '../../../pump-ds/index.js';
import { Drawer } from '../../Drawer.js';
import { Field, NumberInput, Select, TextInput } from '../../primitives/Field.js';
import { DensityCalculator } from './DensityCalculator.js';
import { SectionTitle, Warn } from './draft.js';
import {
  PURCHASES,
  SETTINGS,
  TANKS,
  fmtL,
  fmtSigned,
  receivedQty,
  type ProtoDecantation,
} from './mock.js';
import { StepSection } from './variants.js';

type Product = 'MS' | 'HSD';
type Mark = 'ok' | 'short' | 'excess' | '';

interface Line {
  product: Product;
  tankId: string;
  beforeDip: string;
  roDensity: string;
  doAfterDip: boolean;
  afterDip: string;
  salesDuring: string;
}
interface Chamber {
  capacity: string;
  line: number;
  sealOk: boolean;
  mark: Mark;
  dipMm: string;
  emptied: boolean;
}

const newLine = (product: Product = 'HSD'): Line => ({
  product,
  tankId: TANKS.find((t) => t.product === product)!.id,
  beforeDip: '',
  roDensity: '',
  doAfterDip: false,
  afterDip: '',
  salesDuring: '',
});
const newChamber = (line = 0, capacity = '4000'): Chamber => ({
  capacity,
  line,
  sealOk: true,
  mark: '',
  dipMm: '',
  emptied: false,
});

const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 };
const grid2b = grid2;

const lineColor = ['#2563eb', '#c2410c', '#7c3aed', '#0f766e'];

const KV: React.FC<{ items: [string, React.ReactNode][] }> = ({ items }) => (
  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
    {items.map(([k, v]) => (
      <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '.04em',
            opacity: 0.55,
          }}
        >
          {k}
        </span>
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
      </div>
    ))}
  </div>
);

const LineTag: React.FC<{ i: number; label: string }> = ({ i, label }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      fontWeight: 600,
    }}
  >
    <span style={{ width: 8, height: 8, borderRadius: 4, background: lineColor[i % 4] }} />
    {label}
  </span>
);

export const VariantMulti: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (rows: ProtoDecantation[]) => void;
}> = ({ isOpen, onClose, onSave }) => {
  const [tankerNo, setTankerNo] = useState('');
  const [driver, setDriver] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine('MS'), newLine('HSD')]);
  const [checkChambers, setCheckChambers] = useState(false);
  const [chambers, setChambers] = useState<Chamber[]>([
    newChamber(0),
    newChamber(1),
    newChamber(1),
  ]);
  const [purchaseIds, setPurchaseIds] = useState<string[]>([]);
  const selected = PURCHASES.filter((p) => purchaseIds.includes(p.id));
  const togglePurchase = (id: string) =>
    setPurchaseIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      const prod = PURCHASES.find((p) => p.id === id)!.product;
      // One invoice per product per tanker visit (OMCs invoice per product).
      return [...ids.filter((x) => PURCHASES.find((p) => p.id === x)!.product !== prod), id];
    });
  const [open, setOpen] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());

  const updLine = (i: number, p: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const updCh = (i: number, p: Partial<Chamber>) =>
    setChambers((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const usedTanks = new Set(lines.map((l) => l.tankId));

  const calc = useMemo(
    () =>
      lines.map((l, i) => {
        const purchase = selected.find((p) => p.product === l.product);
        const tank = TANKS.find((t) => t.id === l.tankId);
        const ro = l.roDensity ? Number(l.roDensity) : null;
        const densityDiff =
          purchase && ro != null ? +(ro - purchase.invoiceDensity).toFixed(1) : null;
        const densityOut = densityDiff != null && Math.abs(densityDiff) > SETTINGS.densityTolerance;
        const received =
          l.doAfterDip && l.afterDip && l.beforeDip
            ? receivedQty(Number(l.beforeDip), Number(l.afterDip), Number(l.salesDuring || 0))
            : null;
        const myCh = checkChambers ? chambers.filter((c) => c.line === i) : [];
        const chamberTotal = myCh.reduce((a, c) => a + Number(c.capacity || 0), 0);
        return {
          purchase,
          tank,
          densityDiff,
          densityOut,
          received,
          chamberTotal,
          chamberShort: myCh.some((c) => c.mark === 'short' || !c.sealOk),
          chamberExcess: myCh.some((c) => c.mark === 'excess'),
          notEmptied: end !== '' && myCh.some((c) => !c.emptied),
          label: `${tank?.name ?? '—'} · ${l.product}`,
        };
      }),
    [lines, chambers, checkChambers, end, purchaseIds],
  );

  // Variance is per INVOICE: Σ received of every tank line of that product.
  const perInvoice = selected.map((p) => {
    const idx = lines.map((l, i) => (l.product === p.product ? i : -1)).filter((i) => i >= 0);
    const pending = idx.some((i) => calc[i].received == null);
    const received = pending ? null : idx.reduce((a, i) => a + (calc[i].received ?? 0), 0);
    const chamberTotal = idx.reduce((a, i) => a + calc[i].chamberTotal, 0);
    return { p, idx, received, diff: received != null ? received - p.qty : null, chamberTotal };
  });
  const unlinkedProducts = [...new Set(lines.map((l) => l.product))].filter(
    (pr) => !selected.some((p) => p.product === pr),
  );

  const flagged = calc.some((c) => c.densityOut || c.chamberShort || c.notEmptied);

  const next = (i: number) => {
    setDone((s) => new Set(s).add(i));
    setOpen(i + 1);
  };
  const cont = (i: number, label: string) => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
      <Button size="sm" onClick={() => next(i)}>
        {label}
      </Button>
    </div>
  );

  const save = () => {
    const visit = `v${Date.now()}`;
    onSave(
      lines.map((l, i) => ({
        id: `${visit}-${i}`,
        visitId: visit,
        lineCount: lines.length,
        date: '2026-10-11',
        tankerNo: tankerNo || 'KL-07-XX-0000',
        driver,
        tankId: l.tankId,
        product: l.product,
        purchaseId: calc[i].purchase?.id ?? null,
        beforeDip: Number(l.beforeDip || 0),
        roDensity: Number(l.roDensity || 0),
        start,
        end,
        afterDip: calc[i].received != null ? Number(l.afterDip) : null,
        salesDuring: Number(l.salesDuring || 0),
        status: calc[i].received != null ? 'measured' : 'pending',
        received: calc[i].received,
        sealOk: !calc[i].chamberShort && !calc[i].notEmptied,
      })),
    );
    onClose();
  };

  /* ---------- compact cards for completed steps ---------- */
  const summaries: React.ReactNode[] = [
    <div key="s0" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <KV
        items={[
          ['Tanker', tankerNo || '—'],
          ['Driver', driver || '—'],
        ]}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {selected.map((p) => (
          <Chip key={p.id} size="sm" tone="neutral">
            {p.product} · {p.invoiceNo} · {fmtL(p.qty)} · {p.invoiceDensity} kg/m³
          </Chip>
        ))}
        {unlinkedProducts.map((pr) => (
          <Chip key={pr} size="sm" tone="warning">
            {pr}: purchase not linked
          </Chip>
        ))}
      </div>
    </div>,
    <div key="s1" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 120 }}>
            <LineTag i={i} label={calc[i].label} />
          </span>
          <KV
            items={[
              ['Before', fmtL(l.beforeDip ? Number(l.beforeDip) : null)],
              ['RO density', l.roDensity || '—'],
              [
                'Δ vs invoice',
                calc[i].densityDiff != null ? (
                  <Chip size="sm" tone={calc[i].densityOut ? 'danger' : 'success'}>
                    {fmtSigned(calc[i].densityDiff!, 'kg/m³')}
                  </Chip>
                ) : (
                  '—'
                ),
              ],
            ]}
          />
        </div>
      ))}
    </div>,
    checkChambers ? (
      <div key="s2" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chambers.map((c, i) => (
          <Chip
            key={i}
            size="sm"
            tone={
              c.mark === 'short' || !c.sealOk
                ? 'danger'
                : c.mark === 'excess'
                  ? 'info'
                  : c.mark === 'ok'
                    ? 'success'
                    : 'neutral'
            }
          >
            #{i + 1} {fmtL(Number(c.capacity || 0))} → {calc[c.line]?.label}
            {c.mark ? ` · ${c.mark}` : ''}
            {!c.sealOk ? ' · seal broken' : ''}
          </Chip>
        ))}
      </div>
    ) : (
      <span key="s2" style={{ fontSize: 12, opacity: 0.6 }}>
        Chambers not checked
      </span>
    ),
    <KV
      key="s3"
      items={[
        ['Start', start || '—'],
        ['End', end || '—'],
      ]}
    />,
    <div key="s4" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 120 }}>
            <LineTag i={i} label={calc[i].label} />
          </span>
          {l.doAfterDip ? (
            <KV
              items={[
                ['After', fmtL(Number(l.afterDip || 0))],
                ['Sales during', fmtL(Number(l.salesDuring || 0))],
                ['Received', fmtL(calc[i].received)],
              ]}
            />
          ) : (
            <Chip size="sm" tone="info">
              Pending measurement — next Tank Dip
            </Chip>
          )}
        </div>
      ))}
      {checkChambers && (
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Chambers emptied: {chambers.filter((c) => c.emptied).length}/{chambers.length}
        </span>
      )}
    </div>,
  ];

  const markBtn = (i: number, v: Exclude<Mark, ''>, label: string) => {
    const on = chambers[i].mark === v;
    const tone = {
      ok: ['var(--color-success-bg,#e7f6ec)', 'var(--color-success-fg,#157f3c)'],
      short: ['var(--color-danger-bg,#fdecec)', 'var(--color-danger-fg,#b42318)'],
      excess: ['var(--color-info-bg,#eaf3ff)', 'var(--color-info-fg,#1d4ed8)'],
    }[v];
    return (
      <button
        type="button"
        onClick={() => updCh(i, { mark: on ? '' : v })}
        style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          border: '1px solid var(--color-border-strong,#ccc)',
          background: on ? tone[0] : 'transparent',
          color: on ? tone[1] : 'inherit',
          fontWeight: on ? 600 : 400,
        }}
      >
        {label}
      </button>
    );
  };

  const cell: React.CSSProperties = { padding: '4px 6px', fontSize: 12, verticalAlign: 'middle' };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="New Decantation"
      widthVariant="wide"
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {lines.length} tank{lines.length > 1 ? 's' : ''} · one tanker visit
          </span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={flagged ? 'danger' : 'primary'} size="sm" onClick={save}>
            {flagged ? 'Save with flag' : 'Save Decantation'}
          </Button>
        </div>
      }
    >
      {/* 1 */}
      <StepSection
        n={1}
        title="Tanker & invoices"
        open={open === 0}
        done={done.has(0)}
        summary={summaries[0]}
        card
        onOpen={() => setOpen(0)}
      >
        <div style={grid2}>
          <Field label="Tanker no." required>
            <TextInput
              placeholder="KL-07-CB-4412"
              value={tankerNo}
              onChange={(e) => setTankerNo(e.target.value)}
            />
          </Field>
          <Field label="Driver">
            <TextInput value={driver} onChange={(e) => setDriver(e.target.value)} />
          </Field>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, margin: '2px 0 6px' }}>
          Fuel Purchases on this tanker{' '}
          <span style={{ fontWeight: 400, opacity: 0.6 }}>
            · one per product · optional, can link later
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {PURCHASES.map((p) => {
            const on = purchaseIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePurchase(p.id)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  border: `1px solid ${on ? 'var(--color-brand,#2563eb)' : 'var(--color-border,#e5e5e5)'}`,
                  background: on
                    ? 'color-mix(in oklab, var(--color-brand,#2563eb) 8%, transparent)'
                    : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>
                    {on ? '✓ ' : ''}
                    {p.product} · {p.invoiceNo}
                  </span>
                  <span>{fmtL(p.qty)}</span>
                </div>
                <div style={{ opacity: 0.65, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{p.invoiceDate}</span>
                  <span>{p.invoiceDensity} kg/m³</span>
                </div>
              </button>
            );
          })}
        </div>
        {cont(0, 'Continue to Tanks')}
      </StepSection>

      {/* 2 */}
      <StepSection
        n={2}
        title="Tanks"
        open={open === 1}
        done={done.has(1)}
        summary={summaries[1]}
        card
        onOpen={() => setOpen(1)}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
          One line per tank this tanker unloads into. Invoice density comes from the invoice of the
          line's product.
        </div>
        {lines.map((l, i) => {
          const c = calc[i];
          return (
            <div
              key={i}
              style={{
                borderLeft: `3px solid ${lineColor[i % 4]}`,
                padding: '8px 0 2px 12px',
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <LineTag i={i} label={`Tank line ${i + 1}`} />
                {lines.length > 1 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    leftIcon={<Icon name="trash" size="xs" />}
                    onClick={() => {
                      setLines((ls) => ls.filter((_, j) => j !== i));
                      setChambers((cs) =>
                        cs
                          .filter((x) => x.line !== i)
                          .map((x) => ({ ...x, line: x.line > i ? x.line - 1 : x.line })),
                      );
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div style={grid3}>
                <Field label="Product">
                  <Select
                    value={l.product}
                    onChange={(e) => {
                      const p = e.target.value as Product;
                      updLine(i, {
                        product: p,
                        tankId: TANKS.find((t) => t.product === p)!.id,
                      });
                    }}
                  >
                    <option value="MS">MS (Petrol)</option>
                    <option value="HSD">HSD (Diesel)</option>
                  </Select>
                </Field>
                <Field label="Tank">
                  <Select value={l.tankId} onChange={(e) => updLine(i, { tankId: e.target.value })}>
                    {TANKS.filter((t) => t.product === l.product).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {usedTanks.has(t.id) && t.id !== l.tankId ? ' (used)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div style={grid3}>
                <Field label="Before dip (L)" hint={`Book ${fmtL(c.tank?.bookStock)}`}>
                  <NumberInput
                    value={l.beforeDip}
                    onChange={(e) => updLine(i, { beforeDip: e.target.value })}
                  />
                </Field>
                <Field
                  label="RO density"
                  hint={c.purchase ? `Invoice ${c.purchase.invoiceDensity}` : undefined}
                >
                  <NumberInput
                    value={l.roDensity}
                    onChange={(e) => updLine(i, { roDensity: e.target.value })}
                  />
                </Field>
                <div style={{ paddingTop: 22 }}>
                  <DensityCalculator compact onUse={(r) => updLine(i, { roDensity: String(r) })} />
                </div>
              </div>
              {c.densityOut && (
                <Warn tone="danger">
                  <strong>Density off by {fmtSigned(c.densityDiff!, 'kg/m³')}</strong> on {c.label}.
                  You can continue — it will be flagged.
                </Warn>
              )}
            </div>
          );
        })}
        <Button
          variant="outline"
          size="xs"
          leftIcon={<Icon name="plus" size="xs" />}
          onClick={() => setLines((ls) => [...ls, newLine('HSD')])}
        >
          Add tank
        </Button>
        <div style={{ height: 12 }} />
        {cont(1, 'Continue to Tanker chambers')}
      </StepSection>

      {/* 3 */}
      <StepSection
        n={3}
        title="Tanker chambers"
        open={open === 2}
        done={done.has(2)}
        summary={summaries[2]}
        card
        onOpen={() => setOpen(2)}
      >
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          <input
            style={{ marginTop: 3 }}
            type="checkbox"
            checked={checkChambers}
            onChange={(e) => setCheckChambers(e.target.checked)}
          />
          <span>
            Check tanker chambers
            <span style={{ display: 'block', fontSize: 12, opacity: 0.6 }}>
              Optional — seal, dip mark and which tank each chamber goes into
            </span>
          </span>
        </label>
        {checkChambers && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
              <thead>
                <tr style={{ fontSize: 11, opacity: 0.6, textAlign: 'left' }}>
                  <th style={cell}>#</th>
                  <th style={cell}>Qty (L)</th>
                  <th style={cell}>Into</th>
                  <th style={cell}>Seal</th>
                  <th style={cell}>Dip mark</th>
                  <th style={cell}>Dip (mm)</th>
                  <th style={cell} />
                </tr>
              </thead>
              <tbody>
                {chambers.map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--color-border,#eee)' }}>
                    <td style={cell}>{i + 1}</td>
                    <td style={{ ...cell, width: 90 }}>
                      <NumberInput
                        value={c.capacity}
                        onChange={(e) => updCh(i, { capacity: e.target.value })}
                      />
                    </td>
                    <td style={{ ...cell, width: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            flexShrink: 0,
                            background: lineColor[c.line % 4],
                          }}
                        />
                        <Select
                          value={String(c.line)}
                          onChange={(e) => updCh(i, { line: Number(e.target.value) })}
                        >
                          {calc.map((x, j) => (
                            <option key={j} value={j}>
                              {x.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                    <td style={cell}>
                      <input
                        type="checkbox"
                        checked={c.sealOk}
                        onChange={(e) => updCh(i, { sealOk: e.target.checked })}
                      />
                    </td>
                    <td style={cell}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {markBtn(i, 'ok', 'OK')}
                        {markBtn(i, 'short', 'Short')}
                        {markBtn(i, 'excess', 'Excess')}
                      </div>
                    </td>
                    <td style={{ ...cell, width: 80 }}>
                      <NumberInput
                        placeholder="—"
                        value={c.dipMm}
                        onChange={(e) => updCh(i, { dipMm: e.target.value })}
                      />
                    </td>
                    <td style={cell}>
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label="Remove chamber"
                        onClick={() => setChambers((cs) => cs.filter((_, j) => j !== i))}
                      >
                        <Icon name="x" size="xs" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              variant="outline"
              size="xs"
              leftIcon={<Icon name="plus" size="xs" />}
              onClick={() => setChambers((cs) => [...cs, newChamber(0, '')])}
            >
              Add chamber
            </Button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
              {perInvoice.map((x) => (
                <Chip
                  key={x.p.id}
                  size="sm"
                  tone={x.chamberTotal && x.chamberTotal !== x.p.qty ? 'warning' : 'neutral'}
                >
                  {x.p.product} {x.p.invoiceNo}: chambers {fmtL(x.chamberTotal)} / invoice{' '}
                  {fmtL(x.p.qty)}
                </Chip>
              ))}
            </div>
            {calc.some((c) => c.chamberShort) && (
              <Warn tone="danger">
                <strong>Tanker arrived short or a seal is broken</strong> on{' '}
                {calc
                  .filter((c) => c.chamberShort)
                  .map((c) => c.label)
                  .join(', ')}
                . Likely a transit loss. It will be flagged.
              </Warn>
            )}
            {calc.some((c) => c.chamberExcess) && (
              <Warn tone="info">
                A chamber reads above its mark (excess). Recorded, not flagged.
              </Warn>
            )}
          </>
        )}
        {cont(2, 'Continue to Unloading')}
      </StepSection>

      {/* 4 */}
      <StepSection
        n={4}
        title="Unloading"
        open={open === 3}
        done={done.has(3)}
        summary={summaries[3]}
        card
        onOpen={() => setOpen(3)}
      >
        <div style={grid2}>
          <Field label="Unloading start">
            <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Unloading end">
            <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {cont(3, 'Continue to After unloading')}
      </StepSection>

      {/* 5 */}
      <StepSection
        n={5}
        title="After unloading"
        open={open === 4}
        done={done.has(4)}
        summary={summaries[4]}
        card
        onOpen={() => setOpen(4)}
      >
        {checkChambers && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Chambers emptied</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {chambers.map((c, i) => (
                <label
                  key={i}
                  style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={c.emptied}
                    onChange={(e) => updCh(i, { emptied: e.target.checked })}
                  />
                  Chamber {i + 1}
                </label>
              ))}
              <Button
                variant="outline"
                size="xs"
                leftIcon={<Icon name="check" size="xs" />}
                onClick={() => setChambers((cs) => cs.map((x) => ({ ...x, emptied: true })))}
              >
                All emptied
              </Button>
            </div>
          </div>
        )}
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              borderLeft: `3px solid ${lineColor[i % 4]}`,
              padding: '6px 0 2px 12px',
              marginBottom: 12,
            }}
          >
            <LineTag i={i} label={calc[i].label} />
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                fontSize: 13,
                margin: '8px 0',
              }}
            >
              <input
                style={{ marginTop: 3 }}
                type="checkbox"
                checked={l.doAfterDip}
                onChange={(e) => updLine(i, { doAfterDip: e.target.checked })}
              />
              <span>
                Take after-unloading dip now
                <span style={{ display: 'block', fontSize: 12, opacity: 0.6 }}>
                  Optional — otherwise the next routine Tank Dip measures it
                </span>
              </span>
            </label>
            {l.doAfterDip && (
              <div style={grid2}>
                <Field label="After dip (L)">
                  <NumberInput
                    value={l.afterDip}
                    onChange={(e) => updLine(i, { afterDip: e.target.value })}
                  />
                </Field>
                <Field label="Sales during unloading (L)">
                  <NumberInput
                    value={l.salesDuring}
                    onChange={(e) => updLine(i, { salesDuring: e.target.value })}
                  />
                </Field>
              </div>
            )}
          </div>
        ))}
        {calc.some((c) => c.notEmptied) && (
          <Warn tone="danger">Not every chamber is marked emptied. It will be flagged.</Warn>
        )}
        {cont(4, 'Review')}
      </StepSection>

      {open === 5 && (
        <div
          style={{ border: '1px solid var(--color-border,#e5e5e5)', borderRadius: 8, padding: 12 }}
        >
          <SectionTitle>Review — per invoice (variance)</SectionTitle>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}
          >
            <thead>
              <tr style={{ fontSize: 11, opacity: 0.6, textAlign: 'left' }}>
                <th style={cell}>Invoice</th>
                <th style={cell}>Tanks</th>
                <th style={{ ...cell, textAlign: 'right' }}>Invoice qty</th>
                <th style={{ ...cell, textAlign: 'right' }}>Received</th>
                <th style={{ ...cell, textAlign: 'right' }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {perInvoice.map((x) => (
                <tr key={x.p.id} style={{ borderTop: '1px solid var(--color-border,#eee)' }}>
                  <td style={cell}>
                    {x.p.product} · {x.p.invoiceNo}
                  </td>
                  <td style={cell}>
                    {x.idx.map((i) => (
                      <div key={i}>
                        <LineTag i={i} label={calc[i].label} />
                      </div>
                    ))}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>{fmtL(x.p.qty)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {x.received != null ? (
                      fmtL(x.received)
                    ) : (
                      <Chip tone="info" size="sm">
                        Pending measurement
                      </Chip>
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {x.diff != null ? (
                      <Chip tone={x.diff < 0 ? 'danger' : 'success'} size="sm">
                        {x.diff < 0 ? 'Short' : 'Excess'} {fmtSigned(x.diff, 'L')}
                      </Chip>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
              {unlinkedProducts.map((pr) => (
                <tr key={pr} style={{ borderTop: '1px solid var(--color-border,#eee)' }}>
                  <td style={cell} colSpan={5}>
                    <Chip tone="warning" size="sm">
                      {pr}: purchase not linked — variance waits for the invoice
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <SectionTitle>Per tank (stock)</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {calc.map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--color-border,#eee)' }}>
                  <td style={cell}>
                    <LineTag i={i} label={c.label} />
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {c.received != null ? `+${fmtL(c.received)} to stock` : 'Pending measurement'}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {c.densityDiff != null ? (
                      <Chip tone={c.densityOut ? 'danger' : 'success'} size="sm">
                        Δρ {fmtSigned(c.densityDiff, 'kg/m³')}
                      </Chip>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
};
