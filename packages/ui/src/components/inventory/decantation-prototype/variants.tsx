// PROTOTYPE — throwaway. Three structurally different Decantation entry
// flows, switched by ?variant=A|B|C.
//   A — Stepper: one step at a time, mirrors the paper workflow.
//   B — Single page: every section on one scroll, live summary pinned on top.
//   C — Split: invoice/purchase on the left, tank + dips on the right, wide drawer.
import React, { useState } from 'react';
import { Button, Chip, Icon } from '../../../pump-ds/index.js';
import { Drawer } from '../../Drawer.js';
import { Field, NumberInput, TextInput, Select } from '../../primitives/Field.js';
import { DensityCalculator } from './DensityCalculator.js';
import {
  DraftWarnings,
  ResultRows,
  SectionTitle,
  Warn,
  newChamber,
  useDraft,
  type Chamber,
  type DraftApi,
} from './draft.js';
import { fmtL, type ProtoDecantation } from './mock.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (d: ProtoDecantation) => void;
}

const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };

/* ---------- field groups (content only; each variant lays them out) ---------- */

const VehicleFields: React.FC<{ api: DraftApi }> = ({ api }) => (
  <>
    <div style={grid2}>
      <Field label="Tanker no." required>
        <TextInput
          placeholder="KL-07-CB-4412"
          value={api.d.tankerNo}
          onChange={(e) => api.set('tankerNo', e.target.value)}
        />
      </Field>
      <Field label="Driver">
        <TextInput value={api.d.driver} onChange={(e) => api.set('driver', e.target.value)} />
      </Field>
    </div>
    <Field label="Product" required>
      <Select
        value={api.d.product}
        onChange={(e) => {
          const product = e.target.value as 'MS' | 'HSD';
          api.set('product', product);
          api.set('purchaseId', null);
          api.set('tankId', product === 'MS' ? 't1' : 't3');
        }}
      >
        <option value="MS">MS (Petrol)</option>
        <option value="HSD">HSD (Diesel)</option>
      </Select>
    </Field>
  </>
);

const PurchasePicker: React.FC<{ api: DraftApi; asList?: boolean }> = ({ api, asList }) =>
  asList ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {api.openPurchases.map((p) => {
        const on = api.d.purchaseId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => api.set('purchaseId', on ? null : p.id)}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${on ? 'var(--color-brand, #2563eb)' : 'var(--color-border, #e5e5e5)'}`,
              background: on
                ? 'color-mix(in oklab, var(--color-brand, #2563eb) 8%, transparent)'
                : 'transparent',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
              <span>{p.invoiceNo}</span>
              <span>{fmtL(p.qty)}</span>
            </div>
            <div style={{ opacity: 0.65, display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {p.invoiceDate} · {p.supplier}
              </span>
              <span>{p.invoiceDensity} kg/m³</span>
            </div>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => api.set('purchaseId', null)}
        style={{
          fontSize: 12,
          opacity: 0.7,
          background: 'none',
          border: 0,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        {api.d.purchaseId
          ? 'Unlink — invoice not entered yet'
          : '✓ Link later (invoice not entered yet)'}
      </button>
    </div>
  ) : (
    <Field label="Fuel Purchase (invoice)" hint="Optional. Can be linked later.">
      <Select
        value={api.d.purchaseId ?? ''}
        onChange={(e) => api.set('purchaseId', e.target.value || null)}
      >
        <option value="">— Link later —</option>
        {api.openPurchases.map((p) => (
          <option key={p.id} value={p.id}>
            {p.invoiceNo} · {p.invoiceDate} · {p.qty.toLocaleString('en-IN')} L
          </option>
        ))}
      </Select>
    </Field>
  );

const InvoiceReadout: React.FC<{ api: DraftApi }> = ({ api }) =>
  api.purchase ? (
    <div style={{ ...grid2, fontSize: 12, marginBottom: 12, opacity: 0.85 }}>
      <span>
        Invoice qty: <strong>{fmtL(api.purchase.qty)}</strong>
      </span>
      <span>
        Invoice density: <strong>{api.purchase.invoiceDensity}</strong>
      </span>
      <span>Rate: ₹{api.purchase.rate}</span>
      <span>Value: ₹{(api.purchase.qty * api.purchase.rate).toLocaleString('en-IN')}</span>
    </div>
  ) : null;

const BeforeFields: React.FC<{ api: DraftApi }> = ({ api }) => (
  <>
    <div style={grid2}>
      <Field label="Tank" required>
        <Select value={api.d.tankId} onChange={(e) => api.set('tankId', e.target.value)}>
          {api.tanksForProduct.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.product}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Before dip (L)" required hint={`Book stock ${fmtL(api.tank?.bookStock)}`}>
        <NumberInput
          value={api.d.beforeDip}
          onChange={(e) => api.set('beforeDip', e.target.value)}
        />
      </Field>
    </div>
    <Field label="RO density (kg/m³ at 15 °C)" required>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <NumberInput
          value={api.d.roDensity}
          onChange={(e) => api.set('roDensity', e.target.value)}
          style={{ flex: 1 }}
        />
        <DensityCalculator compact onUse={(r) => api.set('roDensity', String(r))} />
      </div>
    </Field>
  </>
);

const UnloadFields: React.FC<{ api: DraftApi }> = ({ api }) => (
  <div style={grid2}>
    <Field label="Unloading start">
      <TextInput
        type="time"
        value={api.d.start}
        onChange={(e) => api.set('start', e.target.value)}
      />
    </Field>
    <Field label="Unloading end">
      <TextInput type="time" value={api.d.end} onChange={(e) => api.set('end', e.target.value)} />
    </Field>
  </div>
);

const AfterFields: React.FC<{ api: DraftApi }> = ({ api }) => (
  <>
    <label
      style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 12 }}
    >
      <input
        style={{ marginTop: 3 }}
        type="checkbox"
        checked={api.d.doAfterDip}
        onChange={(e) => api.set('doAfterDip', e.target.checked)}
      />
      <span>
        Take after-unloading dip now
        <span style={{ display: 'block', fontSize: 12, opacity: 0.6 }}>
          Optional — holds sales on this tank until the dip is taken
        </span>
      </span>
    </label>
    {api.d.doAfterDip && (
      <>
        <div style={grid2}>
          <Field label="After dip (L)" required>
            <NumberInput
              value={api.d.afterDip}
              onChange={(e) => api.set('afterDip', e.target.value)}
            />
          </Field>
          <Field label="Dip taken at">
            <TextInput
              type="time"
              value={api.d.afterDipAt}
              onChange={(e) => api.set('afterDipAt', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Sales from this tank during unloading (L)" hint="Leave 0 if sales were held.">
          <NumberInput
            value={api.d.salesDuring}
            onChange={(e) => api.set('salesDuring', e.target.value)}
          />
        </Field>
      </>
    )}
  </>
);

const SaveFooter: React.FC<{
  api: DraftApi;
  onSave: Props['onSave'];
  onClose: () => void;
  extra?: React.ReactNode;
}> = ({ api, onSave, onClose, extra }) => {
  const flagged = api.flagged;
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end',
        width: '100%',
        alignItems: 'center',
      }}
    >
      {extra}
      <span style={{ flex: 1 }} />
      <Button variant="ghost" size="sm" onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant={flagged ? 'danger' : 'primary'}
        size="sm"
        onClick={() => {
          onSave(api.toDecantation());
          onClose();
        }}
      >
        {flagged
          ? 'Save with flag'
          : api.received != null
            ? 'Save Decantation'
            : 'Save — pending measurement'}
      </Button>
    </div>
  );
};

/* ----------------------------- Tanker chambers ----------------------------- */

const cell: React.CSSProperties = { padding: '4px 6px', fontSize: 12, verticalAlign: 'middle' };

const ChambersBefore: React.FC<{ api: DraftApi }> = ({ api }) =>
  api.d.checkChambers ? <ChambersTable api={api} /> : null;

const ChamberToggle: React.FC<{ api: DraftApi }> = ({ api }) => (
  <label
    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 12 }}
  >
    <input
      style={{ marginTop: 3 }}
      type="checkbox"
      checked={api.d.checkChambers}
      onChange={(e) => api.set('checkChambers', e.target.checked)}
    />
    <span>
      Check tanker chambers
      <span style={{ display: 'block', fontSize: 12, opacity: 0.6 }}>
        Optional — seal, dip mark and emptied check per chamber
      </span>
    </span>
  </label>
);

const ChambersTable: React.FC<{ api: DraftApi }> = ({ api }) => {
  const upd = (i: number, patch: Partial<Chamber>) =>
    api.set(
      'chambers',
      api.d.chambers.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    );
  const markBtn = (i: number, v: 'ok' | 'short', label: string) => {
    const on = api.d.chambers[i].mark === v;
    return (
      <button
        type="button"
        onClick={() => upd(i, { mark: on ? '' : v })}
        style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          border: '1px solid var(--color-border-strong, #ccc)',
          background: on
            ? v === 'ok'
              ? 'var(--color-success-bg, #e7f6ec)'
              : 'var(--color-danger-bg, #fdecec)'
            : 'transparent',
          color: on
            ? v === 'ok'
              ? 'var(--color-success-fg, #157f3c)'
              : 'var(--color-danger-fg, #b42318)'
            : 'inherit',
          fontWeight: on ? 600 : 400,
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        Tanker chambers{' '}
        <span style={{ fontWeight: 400, opacity: 0.6 }}>· optional check before unloading</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: 11, opacity: 0.6, textAlign: 'left' }}>
            <th style={cell}>#</th>
            <th style={cell}>Qty (L)</th>
            <th style={cell}>Seal</th>
            <th style={cell}>Dip mark</th>
            <th style={cell}>Dip (mm)</th>
            <th style={cell} />
          </tr>
        </thead>
        <tbody>
          {api.d.chambers.map((c, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--color-border, #eee)' }}>
              <td style={cell}>{i + 1}</td>
              <td style={{ ...cell, width: 90 }}>
                <NumberInput
                  value={c.capacity}
                  onChange={(e) => upd(i, { capacity: e.target.value })}
                />
              </td>
              <td style={cell}>
                <input
                  type="checkbox"
                  checked={c.sealOk}
                  onChange={(e) => upd(i, { sealOk: e.target.checked })}
                />
              </td>
              <td style={cell}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {markBtn(i, 'ok', 'OK')}
                  {markBtn(i, 'short', 'Short')}
                </div>
              </td>
              <td style={{ ...cell, width: 80 }}>
                <NumberInput
                  placeholder="—"
                  value={c.dipMm}
                  onChange={(e) => upd(i, { dipMm: e.target.value })}
                />
              </td>
              <td style={cell}>
                <button
                  type="button"
                  aria-label="Remove chamber"
                  onClick={() =>
                    api.set(
                      'chambers',
                      api.d.chambers.filter((_, j) => j !== i),
                    )
                  }
                  style={{ background: 'none', border: 0, cursor: 'pointer', opacity: 0.5 }}
                >
                  <Icon name="x" size="xs" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <Button
          variant="ghost"
          size="xs"
          leftIcon={<Icon name="plus" size="xs" />}
          onClick={() => api.set('chambers', [...api.d.chambers, newChamber()])}
        >
          Add chamber
        </Button>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Total {fmtL(api.chamberTotal)}
          {api.purchase && ` · invoice ${fmtL(api.purchase.qty)}`}
        </span>
      </div>
    </div>
  );
};

const ChambersEmptied: React.FC<{ api: DraftApi }> = ({ api }) =>
  api.d.checkChambers && api.d.chambers.length ? (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Chambers emptied</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {api.d.chambers.map((c, i) => (
          <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={c.emptied}
              onChange={(e) =>
                api.set(
                  'chambers',
                  api.d.chambers.map((x, j) => (j === i ? { ...x, emptied: e.target.checked } : x)),
                )
              }
            />
            Chamber {i + 1}
          </label>
        ))}
        <button
          type="button"
          onClick={() =>
            api.set(
              'chambers',
              api.d.chambers.map((x) => ({ ...x, emptied: true })),
            )
          }
          style={{
            fontSize: 12,
            background: 'none',
            border: 0,
            cursor: 'pointer',
            color: 'var(--color-brand, #2563eb)',
          }}
        >
          All emptied
        </button>
      </div>
    </div>
  ) : null;

/* ---------------------------- Variant A: Stepper ---------------------------- */

const STEPS = ['Vehicle & Invoice', 'Before unloading', 'Unloading', 'After unloading'];

export const VariantA: React.FC<Props> = ({ isOpen, onClose, onSave }) => {
  const api = useDraft();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="New Decantation"
      widthVariant="wide"
      footer={
        last ? (
          <SaveFooter
            api={api}
            onSave={onSave}
            onClose={onClose}
            extra={
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            }
          />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
            <Button size="sm" onClick={() => setStep(step + 1)}>
              Next: {STEPS[step + 1]}
            </Button>
          </div>
        )
      }
    >
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            style={{
              flex: 1,
              border: 0,
              background: 'none',
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
              fontSize: 11,
              opacity: i === step ? 1 : 0.55,
              fontWeight: i === step ? 600 : 400,
            }}
          >
            <div
              style={{
                height: 3,
                borderRadius: 2,
                marginBottom: 4,
                background:
                  i <= step ? 'var(--color-brand, #2563eb)' : 'var(--color-border, #e5e5e5)',
              }}
            />
            {i + 1}. {s}
          </button>
        ))}
      </div>
      {step === 0 && (
        <>
          <VehicleFields api={api} />
          <PurchasePicker api={api} />
          <InvoiceReadout api={api} />
        </>
      )}
      {step === 1 && (
        <>
          <ChamberToggle api={api} />
          <ChambersBefore api={api} />
          <BeforeFields api={api} />
          {api.densityOut && (
            <Warn tone="danger">
              <strong>Density off by {api.densityDiff} kg/m³</strong> vs invoice. You can continue —
              the Decantation will be flagged for the Owner.
            </Warn>
          )}
        </>
      )}
      {step === 2 && <UnloadFields api={api} />}
      {step === 3 && (
        <>
          <ChambersEmptied api={api} />
          <AfterFields api={api} />
          <SectionTitle>Summary</SectionTitle>
          <ResultRows api={api} />
          <div style={{ height: 12 }} />
          <DraftWarnings api={api} />
        </>
      )}
    </Drawer>
  );
};

/* ------------------------- Variant B: Single page ------------------------- */

export const VariantB: React.FC<Props> = ({ isOpen, onClose, onSave }) => {
  const api = useDraft();
  const flagged = api.flagged;
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="New Decantation"
      widthVariant="wide"
      footer={<SaveFooter api={api} onSave={onSave} onClose={onClose} />}
    >
      <div
        style={{
          position: 'sticky',
          top: -16,
          zIndex: 2,
          margin: '-16px -16px 16px',
          padding: '10px 16px',
          background: 'var(--color-surface-alt, #f7f7f7)',
          borderBottom: '1px solid var(--color-border, #e5e5e5)',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          fontSize: 12,
        }}
      >
        <strong style={{ marginRight: 4 }}>{api.tank?.name ?? '—'}</strong>
        {api.purchase ? (
          <Chip tone="neutral" size="sm">
            Invoice {fmtL(api.purchase.qty)}
          </Chip>
        ) : (
          <Chip tone="info" size="sm">
            Purchase not linked
          </Chip>
        )}
        {api.received != null ? (
          <Chip tone="neutral" size="sm">
            Received {fmtL(api.received)}
          </Chip>
        ) : (
          <Chip tone="info" size="sm">
            Pending measurement
          </Chip>
        )}
        {api.qtyDiff != null && (
          <Chip tone={api.qtyDiff < 0 ? 'danger' : 'success'} size="sm">
            {api.qtyDiff < 0 ? 'Short' : 'Excess'} {Math.abs(api.qtyDiff)} L
          </Chip>
        )}
        {api.densityDiff != null && (
          <Chip tone={api.densityOut ? 'danger' : 'success'} size="sm">
            Δρ {api.densityDiff > 0 ? '+' : ''}
            {api.densityDiff}
          </Chip>
        )}
        {flagged && (
          <Chip tone="danger" size="sm" icon={<Icon name="warning" size="xs" />}>
            Will be flagged
          </Chip>
        )}
      </div>

      <SectionTitle n={1}>Vehicle & Invoice</SectionTitle>
      <VehicleFields api={api} />
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        Fuel Purchase{' '}
        <span style={{ fontWeight: 400, opacity: 0.6 }}>· optional, can link later</span>
      </div>
      <PurchasePicker api={api} asList />
      <div style={{ height: 14 }} />

      <SectionTitle n={2}>Before unloading</SectionTitle>
      <ChamberToggle api={api} />
      <ChambersBefore api={api} />
      <BeforeFields api={api} />

      <SectionTitle n={3}>Unloading</SectionTitle>
      <UnloadFields api={api} />

      <SectionTitle n={4}>After unloading</SectionTitle>
      <ChambersEmptied api={api} />
      <AfterFields api={api} />
      <DraftWarnings api={api} />
    </Drawer>
  );
};

/* --------------------------- Variant C: Split pane --------------------------- */

export const VariantC: React.FC<Props> = ({ isOpen, onClose, onSave }) => {
  const api = useDraft();
  const col: React.CSSProperties = { flex: 1, minWidth: 0 };
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="New Decantation"
      widthVariant="xwide"
      footer={<SaveFooter api={api} onSave={onSave} onClose={onClose} />}
    >
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ ...col, flex: 0.85 }}>
          <SectionTitle>Tanker & paperwork</SectionTitle>
          <VehicleFields api={api} />
          <SectionTitle>Link Fuel Purchase</SectionTitle>
          <PurchasePicker api={api} asList />
        </div>
        <div style={{ width: 1, background: 'var(--color-border, #e5e5e5)' }} />
        <div style={col}>
          <SectionTitle>At the tank</SectionTitle>
          <ChamberToggle api={api} />
          <ChambersBefore api={api} />
          <BeforeFields api={api} />
          <UnloadFields api={api} />
          <ChambersEmptied api={api} />
          <AfterFields api={api} />
        </div>
        <div style={{ width: 1, background: 'var(--color-border, #e5e5e5)' }} />
        <div style={{ ...col, flex: 0.8 }}>
          <SectionTitle>Reconciliation</SectionTitle>
          <ResultRows api={api} />
          <div style={{ height: 14 }} />
          <DraftWarnings api={api} />
        </div>
      </div>
    </Drawer>
  );
};

export const VARIANTS = {
  B: { name: 'Single page + live summary (recommended)', C: VariantB },
  A: { name: 'Stepper', C: VariantA },
  C: { name: 'Split pane (wide)', C: VariantC },
} as const;
export type VariantKey = keyof typeof VARIANTS;
