// PROTOTYPE — throwaway (#476). Field blocks shared by the three flow variants.
// Built only from the revamp's primitives (Fields, StatusBadge, AddButton).
import React from 'react';
import {
  AddButton,
  NumberField,
  SelectField,
  TextField,
} from '../../components/handover/Fields.js';
import { StatusBadge } from '../../ui/index.js';
import { CheckIcon } from '../../ui/icons.js';
import {
  PRODUCT_NAME,
  PURCHASES,
  TANKS,
  TOLERANCE,
  lakh,
  newLine,
  signed,
  type Mark,
  type Product,
  type VisitApi,
} from './model.js';

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  sub?: string;
}> = ({ checked, onChange, title, sub }) => (
  <label className="flex items-start gap-3 rounded-xl border border-line bg-card-alt p-3">
    <input
      type="checkbox"
      className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="min-w-0">
      <span className="block text-[13px] font-bold text-text-high">{title}</span>
      {sub && <span className="block text-[11px] text-text-muted">{sub}</span>}
    </span>
  </label>
);

export const Warn: React.FC<{ tone?: 'bad' | 'warn' | 'info'; children: React.ReactNode }> = ({
  tone = 'warn',
  children,
}) => (
  <p
    className={`rounded-xl border px-3 py-2 text-[12px] ${
      tone === 'bad'
        ? 'border-bad-line bg-bad-soft text-bad-fg'
        : tone === 'info'
          ? 'border-line bg-card-alt text-text-muted'
          : 'border-warn-line bg-warn-soft text-warn-fg'
    }`}
  >
    {children}
  </p>
);

/* -------- Tanker & invoices -------- */
export const TankerFields: React.FC<{ api: VisitApi }> = ({ api }) => (
  <>
    <div className="grid grid-cols-2 gap-2.5">
      <TextField
        label="Tanker no."
        value={api.v.tanker}
        placeholder="KL-07-CB-4412"
        onChange={(x) => api.set({ tanker: x })}
      />
      <TextField label="Driver" value={api.v.driver} onChange={(x) => api.set({ driver: x })} />
    </div>
    <p className="text-[11.5px] font-semibold text-text-muted">
      Fuel Purchases · one per product · optional
    </p>
    <div className="flex flex-col gap-2">
      {PURCHASES.map((p) => {
        const on = api.v.purchaseIds.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => api.togglePurchase(p.id)}
            aria-pressed={on}
            className={`flex items-center gap-3 rounded-xl border p-3 text-left ${
              on ? 'border-accent bg-accent-soft' : 'border-line bg-card-alt'
            }`}
          >
            <span
              className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border ${
                on ? 'border-accent bg-accent text-white' : 'border-line-strong'
              }`}
            >
              {on && <CheckIcon size={12} strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-text-high">
                {PRODUCT_NAME[p.product]} · {p.no}
              </span>
              <span className="num block text-[11px] text-text-muted">
                {p.date} · {lakh(p.qty)} · {p.density} kg/m³
              </span>
            </span>
          </button>
        );
      })}
    </div>
    {api.v.purchaseIds.length === 0 && (
      <Warn tone="info">No invoice yet? Link it later from the list.</Warn>
    )}
  </>
);

/* -------- Tanks (before) -------- */
export const TankLines: React.FC<{ api: VisitApi; afterOnly?: boolean }> = ({ api, afterOnly }) => (
  <>
    {api.v.lines.map((l, i) => {
      const x = api.d.lines[i];
      return (
        <div key={i} className="flex flex-col gap-2.5 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-bold text-text-high">{x.label}</span>
            {!afterOnly && api.v.lines.length > 1 && (
              <button
                type="button"
                className="text-[12px] font-semibold text-bad-fg"
                onClick={() => api.set({ lines: api.v.lines.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            )}
          </div>
          {!afterOnly ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <SelectField
                  label="Product"
                  value={l.product}
                  onChange={(p) =>
                    api.setLine(i, {
                      product: p as Product,
                      tankId: TANKS.find((t) => t.product === p)!.id,
                    })
                  }
                >
                  <option value="MS">Petrol (MS)</option>
                  <option value="HSD">Diesel (HSD)</option>
                </SelectField>
                <SelectField
                  label="Tank"
                  value={l.tankId}
                  onChange={(t) => api.setLine(i, { tankId: t })}
                >
                  {TANKS.filter((t) => t.product === l.product).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField
                  label="Before dip (L)"
                  value={l.before}
                  meta={`Book ${lakh(x.tank.book)}`}
                  onChange={(v) => api.setLine(i, { before: v })}
                />
                <NumberField
                  label="RO density"
                  value={l.density}
                  meta={x.purchase ? `Invoice ${x.purchase.density}` : 'kg/m³ at 15 °C'}
                  onChange={(v) => api.setLine(i, { density: v })}
                />
              </div>
              {x.densityOut && (
                <Warn tone="bad">
                  Density {signed(x.densityDiff!)} kg/m³ vs invoice (limit ±{TOLERANCE}). You can
                  continue — it will be flagged.
                </Warn>
              )}
            </>
          ) : (
            <>
              <Toggle
                checked={l.afterDip}
                onChange={(b) => api.setLine(i, { afterDip: b })}
                title="Take after-unloading dip now"
                sub="Optional — otherwise the next Tank Dip measures it"
              />
              {l.afterDip && (
                <div className="grid grid-cols-2 gap-2.5">
                  <NumberField
                    label="After dip (L)"
                    value={l.after}
                    onChange={(v) => api.setLine(i, { after: v })}
                  />
                  <NumberField
                    label="Sales during (L)"
                    value={l.sales}
                    onChange={(v) => api.setLine(i, { sales: v })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      );
    })}
    {!afterOnly && (
      <AddButton onClick={() => api.set({ lines: [...api.v.lines, newLine('HSD')] })}>
        + Add tank
      </AddButton>
    )}
  </>
);

/* -------- Chambers -------- */
const MARKS: [Exclude<Mark, ''>, string, string][] = [
  ['ok', 'OK', 'border-good bg-good-soft text-good'],
  ['short', 'Short', 'border-bad bg-bad-soft text-bad-fg'],
  ['excess', 'Excess', 'border-accent bg-accent-soft text-accent'],
];

export const ChamberFields: React.FC<{ api: VisitApi; emptiedOnly?: boolean }> = ({
  api,
  emptiedOnly,
}) => {
  if (emptiedOnly) {
    if (!api.v.checkChambers) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11.5px] font-semibold text-text-muted">Chambers emptied</p>
        <div className="grid grid-cols-2 gap-2">
          {api.v.chambers.map((c, i) => (
            <Toggle
              key={i}
              checked={c.emptied}
              onChange={(b) => api.setChamber(i, { emptied: b })}
              title={`Chamber ${i + 1}`}
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <>
      <Toggle
        checked={api.v.checkChambers}
        onChange={(b) => api.set({ checkChambers: b })}
        title="Check tanker chambers"
        sub="Optional — seal, dip mark, which tank"
      />
      {api.v.checkChambers &&
        api.v.chambers.map((c, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-text-high">Chamber {i + 1}</span>
              <label className="flex items-center gap-1.5 text-[12px] text-text-muted">
                <input
                  type="checkbox"
                  checked={c.seal}
                  onChange={(e) => api.setChamber(i, { seal: e.target.checked })}
                />
                Seal OK
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField
                label="Qty (L)"
                value={c.qty}
                onChange={(v) => api.setChamber(i, { qty: v })}
              />
              <SelectField
                label="Into"
                value={String(c.line)}
                onChange={(v) => api.setChamber(i, { line: Number(v) })}
              >
                {api.d.lines.map((l) => (
                  <option key={l.i} value={l.i}>
                    {l.label}
                  </option>
                ))}
              </SelectField>
            </div>
            <div
              className="grid grid-cols-3 gap-1.5"
              role="radiogroup"
              aria-label={`Chamber ${i + 1} dip mark`}
            >
              {MARKS.map(([m, label, on]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={c.mark === m}
                  onClick={() => api.setChamber(i, { mark: c.mark === m ? '' : m })}
                  className={`h-10 rounded-xl border text-[13px] font-bold ${
                    c.mark === m ? on : 'border-line-strong text-text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      {api.v.checkChambers && (
        <AddButton
          onClick={() =>
            api.set({
              chambers: [
                ...api.v.chambers,
                { qty: '', line: 0, seal: true, mark: '', emptied: false },
              ],
            })
          }
        >
          + Add chamber
        </AddButton>
      )}
    </>
  );
};

/* -------- Unloading -------- */
export const UnloadFields: React.FC<{ api: VisitApi }> = ({ api }) => (
  <div className="grid grid-cols-2 gap-2.5">
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-text-muted">Start</span>
      <input
        type="time"
        value={api.v.start}
        onChange={(e) => api.set({ start: e.target.value })}
        className="h-[46px] rounded-xl border border-line-strong bg-card-alt px-3 text-sm"
      />
    </label>
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-text-muted">End</span>
      <input
        type="time"
        value={api.v.end}
        onChange={(e) => api.set({ end: e.target.value })}
        className="h-[46px] rounded-xl border border-line-strong bg-card-alt px-3 text-sm"
      />
    </label>
  </div>
);

/* -------- Review -------- */
export const Review: React.FC<{ api: VisitApi }> = ({ api }) => (
  <div className="flex flex-col gap-2">
    {api.d.invoices.map((x) => (
      <div
        key={x.p.id}
        className="flex items-center justify-between rounded-xl border border-line p-3"
      >
        <span className="min-w-0">
          <span className="block text-[12.5px] font-bold text-text-high">
            {PRODUCT_NAME[x.p.product]} · {x.p.no}
          </span>
          <span className="num block text-[11px] text-text-muted">
            Invoice {lakh(x.p.qty)} · received {lakh(x.received)}
          </span>
        </span>
        {x.diff == null ? (
          <StatusBadge tone="info">Pending</StatusBadge>
        ) : (
          <StatusBadge tone={x.diff < 0 ? 'bad' : 'good'} num>
            {x.diff < 0 ? 'Short' : 'Excess'} {signed(x.diff)} L
          </StatusBadge>
        )}
      </div>
    ))}
    {api.d.unlinked.map((p) => (
      <Warn key={p}>{PRODUCT_NAME[p]}: purchase not linked — variance waits for the invoice.</Warn>
    ))}
    {api.d.flags.map((f) => (
      <Warn key={f} tone="bad">
        {f}. It will be flagged.
      </Warn>
    ))}
  </div>
);

/* -------- One-line summaries (collapsed cards) -------- */
export const summaries = (api: VisitApi): string[] => [
  [
    api.v.tanker || 'No tanker no.',
    ...api.d.purchases.map((p) => `${p.product} ${lakh(p.qty)}`),
  ].join(' · '),
  api.d.lines
    .map(
      (l, i) => `${l.label}: ${lakh(api.v.lines[i].before ? Number(api.v.lines[i].before) : null)}`,
    )
    .join(' · '),
  api.v.checkChambers
    ? `${api.v.chambers.length} chambers · ${api.v.chambers.filter((c) => c.mark === 'short').length} short`
    : 'Not checked',
  `${api.v.start || '—'} → ${api.v.end || '—'}`,
  api.d.lines
    .map((l) => (l.received == null ? `${l.label}: pending` : `${l.label}: ${lakh(l.received)}`))
    .join(' · '),
];
