import React from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import type { DecantationFlagResult, DecantationSettings, LinkablePurchase } from '@pump/shared';
import { Button, Chip, Icon } from '../../../pump-ds/index.js';
import { Field, NumberInput, Select, TextInput } from '../../primitives/Field.js';
import { DensityCalculatorPopover } from '../../primitives/DensityCalculatorPopover.js';
import { PurchaseCards } from './PurchaseCards.js';
import { KV, LINE_COLORS, LineTag, Notice } from './StepSection.js';
import { emptyChamber, emptyLine, type DecantationFormValues } from './decantationForm.js';
import type { reviewDecantation } from './decantationReview.js';
import { fmtLitres, fmtSignedLitres } from './format.js';

export interface TankOption {
  id: string;
  name: string;
  productId: string;
  productName: string;
  currentVolume: number | null;
}

export interface StepProps {
  form: UseFormReturn<DecantationFormValues>;
  values: DecantationFormValues;
  tanks: TankOption[];
  settings: DecantationSettings;
  flags: DecantationFlagResult;
  review: ReturnType<typeof reviewDecantation>;
}

const grid = (cols: string): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: cols,
  gap: 10,
});

export const tankOf = (tanks: TankOption[], id: string) => tanks.find((t) => t.id === id);
export const lineLabel = (tanks: TankOption[], tankId: string, i: number) => {
  const t = tankOf(tanks, tankId);
  return t ? `${t.name} · ${t.productName}` : `Tank line ${i + 1}`;
};

/* ── 1 · Tanker & invoices ─────────────────────────────────────────────── */

export const InvoicesStep: React.FC<
  StepProps & {
    purchases: Record<string, { data: LinkablePurchase[]; loading: boolean }>;
    fuelProducts: { id: string; name: string }[];
  }
> = ({ form, values, purchases, fuelProducts }) => {
  const { register, formState, setValue } = form;
  return (
    <>
      <div style={grid('1fr 1fr')}>
        <Field label="Tanker no." required error={formState.errors.tankerNumber?.message}>
          <TextInput
            aria-label="Tanker no."
            placeholder="KL-07-CB-4412"
            invalid={!!formState.errors.tankerNumber}
            {...register('tankerNumber')}
          />
        </Field>
        <Field label="Driver">
          <TextInput aria-label="Driver" {...register('driverName')} />
        </Field>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, margin: '2px 0 6px' }}>
        Fuel Purchases on this tanker{' '}
        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
          · one per product · optional, can link later
        </span>
      </div>
      {fuelProducts.map((p) => (
        <div key={p.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{p.name}</div>
          <PurchaseCards
            purchases={purchases[p.id]?.data ?? []}
            loading={purchases[p.id]?.loading}
            selectedId={values.links[p.id] ?? ''}
            onSelect={(purchaseId) =>
              setValue('links', { ...values.links, [p.id]: purchaseId }, { shouldDirty: true })
            }
          />
        </div>
      ))}
    </>
  );
};

export const InvoicesSummary: React.FC<
  StepProps & { purchases: Record<string, { data: LinkablePurchase[] }> }
> = ({ values, tanks, purchases }) => {
  const picked = Object.entries(values.links)
    .filter(([, id]) => id)
    .map(([productId, id]) => ({
      productId,
      purchase: purchases[productId]?.data.find((x) => x.purchaseId === id),
    }));
  const productIds = [...new Set(values.lines.map((l) => tankOf(tanks, l.tankId)?.productId))];
  const unlinked = productIds.filter((p) => p && !values.links[p]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <KV
        items={[
          ['Tanker', values.tankerNumber || '—'],
          ['Driver', values.driverName || '—'],
        ]}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {picked.map(({ productId, purchase }) => (
          <Chip key={productId} size="sm" tone="neutral">
            {tanks.find((t) => t.productId === productId)?.productName} ·{' '}
            {purchase?.invoiceNumber || purchase?.documentNumber || 'linked'}
            {purchase ? ` · ${fmtLitres(purchase.invoiceQty)}` : ''}
            {purchase?.invoiceDensity != null ? ` · ${purchase.invoiceDensity} kg/m³` : ''}
          </Chip>
        ))}
        {unlinked.map((p) => (
          <Chip key={p} size="sm" tone="warning">
            {tanks.find((t) => t.productId === p)?.productName}: purchase not linked
          </Chip>
        ))}
      </div>
    </div>
  );
};

/* ── 2 · Tanks ─────────────────────────────────────────────────────────── */

export const TanksStep: React.FC<
  StepProps & { invoiceDensityByProduct: Record<string, number | null | undefined> }
> = ({ form, values, tanks, settings, flags, invoiceDensityByProduct }) => {
  const { register, formState, setValue, control, getValues } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const used = new Set(values.lines.map((l) => l.tankId));
  const removeLine = (i: number) => {
    // Chambers pointing at a later line follow it; those on the removed line fall back to the first.
    setValue(
      'chambers',
      getValues('chambers').map((c) => ({
        ...c,
        lineIndex: c.lineIndex === i ? 0 : c.lineIndex > i ? c.lineIndex - 1 : c.lineIndex,
      })),
    );
    remove(i);
  };
  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        One line per tank this tanker unloads into. Invoice density comes from the linked Fuel
        Purchase of the line&apos;s product.
      </div>
      {fields.map((field, i) => {
        const line = values.lines[i];
        const tank = tankOf(tanks, line?.tankId ?? '');
        const invoiceDensity = tank ? invoiceDensityByProduct[tank.productId] : undefined;
        const errs = formState.errors.lines?.[i];
        const densityFlag = flags.flags.find(
          (f) => f.code === 'DENSITY_OUT_OF_TOLERANCE' && f.tankLineId === String(i),
        );
        return (
          <div
            key={field.id}
            style={{
              borderLeft: `3px solid ${LINE_COLORS[i % LINE_COLORS.length]}`,
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
              {fields.length > 1 && (
                <Button
                  variant="ghost"
                  size="xs"
                  leftIcon={<Icon name="trash" size="xs" />}
                  onClick={() => removeLine(i)}
                  aria-label={`Remove tank line ${i + 1}`}
                >
                  Remove
                </Button>
              )}
            </div>
            <div style={grid('1fr 1fr 1fr')}>
              <Field label="Tank" required error={errs?.tankId?.message}>
                <Select
                  aria-label={`Tank, line ${i + 1}`}
                  invalid={!!errs?.tankId}
                  {...register(`lines.${i}.tankId`)}
                >
                  <option value="">Choose tank…</option>
                  {tanks.map((t) => (
                    <option
                      key={t.id}
                      value={t.id}
                      disabled={used.has(t.id) && t.id !== line?.tankId}
                    >
                      {t.name} · {t.productName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Before dip (L)"
                error={errs?.beforeDip?.message}
                hint={tank ? `Book ${fmtLitres(tank.currentVolume)}` : undefined}
              >
                <NumberInput
                  aria-label={`Before dip, line ${i + 1}`}
                  invalid={!!errs?.beforeDip}
                  {...register(`lines.${i}.beforeDip`)}
                />
              </Field>
              <Field
                label="RO density (kg/m³ @15 °C)"
                error={errs?.roDensity?.message}
                hint={invoiceDensity != null ? `Invoice ${invoiceDensity}` : undefined}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <NumberInput
                    aria-label={`RO density, line ${i + 1}`}
                    invalid={!!errs?.roDensity}
                    {...register(`lines.${i}.roDensity`)}
                  />
                  <DensityCalculatorPopover
                    method={settings.densityMethod}
                    tolerance={settings.densityToleranceKgM3}
                    {...(invoiceDensity != null ? { invoiceDensity } : {})}
                    {...(line?.observedDensity
                      ? { initialObserved: Number(line.observedDensity) }
                      : {})}
                    {...(line?.observedTempC ? { initialTempC: Number(line.observedTempC) } : {})}
                    {...(line?.roDensity ? { currentValue: Number(line.roDensity) } : {})}
                    onApply={(d15, observed, tempC) => {
                      setValue(`lines.${i}.roDensity`, String(d15), { shouldDirty: true });
                      setValue(`lines.${i}.observedDensity`, String(observed), {
                        shouldDirty: true,
                      });
                      setValue(`lines.${i}.observedTempC`, String(tempC), { shouldDirty: true });
                    }}
                  />
                </div>
              </Field>
            </div>
            {densityFlag && (
              <Notice tone="danger">
                <strong>{densityFlag.message}.</strong> You can continue; it will be flagged.
              </Notice>
            )}
          </div>
        );
      })}
      <Button
        variant="outline"
        size="xs"
        leftIcon={<Icon name="plus" size="xs" />}
        onClick={() => append(emptyLine())}
      >
        Add tank
      </Button>
    </>
  );
};

export const TanksSummary: React.FC<
  StepProps & { invoiceDensityByProduct: Record<string, number | null | undefined> }
> = ({ values, tanks, flags }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {values.lines.map((l, i) => {
      const f = flags.flags.find(
        (x) => x.code === 'DENSITY_OUT_OF_TOLERANCE' && x.tankLineId === String(i),
      );
      return (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 140 }}>
            <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
          </span>
          <KV
            items={[
              ['Before', l.beforeDip ? fmtLitres(Number(l.beforeDip)) : '—'],
              ['RO density', l.roDensity || '—'],
              ...(f
                ? ([
                    [
                      'Density',
                      <Chip key="d" size="sm" tone="danger">
                        Out of tolerance
                      </Chip>,
                    ],
                  ] as [string, React.ReactNode][])
                : []),
            ]}
          />
        </div>
      );
    })}
  </div>
);

/* ── 3 · Tanker chambers ───────────────────────────────────────────────── */

const MARKS: { value: 'OK' | 'SHORT' | 'EXCESS'; label: string; tone: string }[] = [
  { value: 'OK', label: 'OK', tone: 'success' },
  { value: 'SHORT', label: 'Short', tone: 'danger' },
  { value: 'EXCESS', label: 'Excess', tone: 'info' },
];

export const ChambersStep: React.FC<StepProps> = ({ form, values, tanks, flags }) => {
  const { register, setValue, control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'chambers' });
  const cell: React.CSSProperties = { padding: '4px 6px', fontSize: 12, verticalAlign: 'middle' };
  const short = flags.flags.find((f) => f.code === 'TANKER_SHORT');
  return (
    <>
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
          type="checkbox"
          style={{ marginTop: 3 }}
          {...register('checkChambers', {
            onChange: (e) => {
              // First time on: start with one chamber so the table is not empty.
              if (e.target.checked && form.getValues('chambers').length === 0)
                append(emptyChamber(0));
            },
          })}
        />
        <span>
          Check tanker chambers
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
            Optional: seal, dip mark and which tank each chamber goes into
          </span>
        </span>
      </label>
      {values.checkChambers && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={cell}>#</th>
                <th style={cell}>Qty (L)</th>
                <th style={cell}>Into</th>
                <th style={cell}>Seal OK</th>
                <th style={cell}>Dip mark</th>
                <th style={cell}>Dip (mm)</th>
                <th style={cell}>Emptied</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, i) => {
                const c = values.chambers[i];
                return (
                  <tr key={field.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td style={cell}>{i + 1}</td>
                    <td style={{ ...cell, width: 90 }}>
                      <NumberInput
                        aria-label={`Chamber ${i + 1} quantity`}
                        {...register(`chambers.${i}.capacity`)}
                      />
                    </td>
                    <td style={{ ...cell, width: 150 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            flexShrink: 0,
                            background: LINE_COLORS[(c?.lineIndex ?? 0) % LINE_COLORS.length],
                          }}
                        />
                        <Select
                          aria-label={`Chamber ${i + 1} into tank`}
                          {...register(`chambers.${i}.lineIndex`, { valueAsNumber: true })}
                        >
                          {values.lines.map((l, j) => (
                            <option key={j} value={j}>
                              {lineLabel(tanks, l.tankId, j)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                    <td style={cell}>
                      <input
                        type="checkbox"
                        aria-label={`Chamber ${i + 1} seal OK`}
                        {...register(`chambers.${i}.sealOk`)}
                      />
                    </td>
                    <td style={cell}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {MARKS.map((m) => {
                          const on = c?.mark === m.value;
                          return (
                            <button
                              key={m.value}
                              type="button"
                              aria-pressed={on}
                              aria-label={`Chamber ${i + 1} ${m.label}`}
                              onClick={() =>
                                setValue(`chambers.${i}.mark`, on ? '' : m.value, {
                                  shouldDirty: true,
                                })
                              }
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                border: '1px solid var(--border-strong)',
                                background: on ? `var(--state-${m.tone}-bg)` : 'transparent',
                                color: on ? `var(--state-${m.tone}-fg)` : 'var(--text-default)',
                                fontWeight: on ? 600 : 400,
                              }}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ ...cell, width: 80 }}>
                      <NumberInput
                        placeholder="—"
                        aria-label={`Chamber ${i + 1} dip mm`}
                        {...register(`chambers.${i}.dipMm`)}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        type="checkbox"
                        aria-label={`Chamber ${i + 1} emptied`}
                        {...register(`chambers.${i}.emptied`)}
                      />
                    </td>
                    <td style={cell}>
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label={`Remove chamber ${i + 1}`}
                        onClick={() => remove(i)}
                      >
                        <Icon name="x" size="xs" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Button
            variant="outline"
            size="xs"
            leftIcon={<Icon name="plus" size="xs" />}
            onClick={() => append(emptyChamber(0))}
          >
            Add chamber
          </Button>
          {short && (
            <Notice tone="danger">
              <strong>{short.message}.</strong> Likely a transit loss. It will be flagged.
            </Notice>
          )}
          {flags.warnings.map((w) => (
            <Notice key={`${w.code}-${w.chamberNo ?? ''}`} tone="info">
              {w.message}
            </Notice>
          ))}
        </>
      )}
    </>
  );
};

export const ChambersSummary: React.FC<StepProps> = ({ values, tanks }) =>
  !values.checkChambers ? (
    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chambers not checked</span>
  ) : (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {values.chambers.map((c, i) => (
        <Chip
          key={i}
          size="sm"
          tone={
            c.mark === 'SHORT' || !c.sealOk
              ? 'danger'
              : c.mark === 'EXCESS'
                ? 'info'
                : c.mark === 'OK'
                  ? 'success'
                  : 'neutral'
          }
        >
          #{i + 1} {c.capacity ? fmtLitres(Number(c.capacity)) : '—'} →{' '}
          {lineLabel(tanks, values.lines[c.lineIndex]?.tankId ?? '', c.lineIndex)}
          {c.mark ? ` · ${c.mark.toLowerCase()}` : ''}
          {!c.sealOk ? ' · seal broken' : ''}
          {c.emptied ? ' · emptied' : ''}
        </Chip>
      ))}
    </div>
  );

/* ── 4 · Unloading ─────────────────────────────────────────────────────── */

export const UnloadingStep: React.FC<StepProps> = ({ form }) => (
  <div style={grid('1fr 1fr')}>
    <Field label="Unloading started">
      <TextInput type="time" aria-label="Unloading started" {...form.register('unloadStart')} />
    </Field>
    <Field label="Unloading ended">
      <TextInput type="time" aria-label="Unloading ended" {...form.register('unloadEnd')} />
    </Field>
  </div>
);

export const UnloadingSummary: React.FC<StepProps> = ({ values }) => (
  <KV
    items={[
      ['Start', values.unloadStart || '—'],
      ['End', values.unloadEnd || '—'],
    ]}
  />
);

/* ── 5 · After unloading ───────────────────────────────────────────────── */

export const AfterStep: React.FC<StepProps> = ({ form, values, tanks, flags, review }) => {
  const { register, formState } = form;
  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Optional. Skip a tank to leave it pending: the next Tank Dip measures it.
      </div>
      {values.lines.map((l, i) => {
        const early = flags.flags.find(
          (f) => f.code === 'EARLY_AFTER_DIP' && f.tankLineId === String(i),
        );
        const received = review.lines[i]?.received;
        const errs = formState.errors.lines?.[i];
        return (
          <div
            key={i}
            style={{
              borderLeft: `3px solid ${LINE_COLORS[i % LINE_COLORS.length]}`,
              padding: '4px 0 2px 12px',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
              <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <input
                  type="checkbox"
                  aria-label={`Measure line ${i + 1} now`}
                  {...register(`lines.${i}.doAfterDip`)}
                />
                Take after dip now
              </label>
            </div>
            {l.doAfterDip ? (
              <div style={grid('1fr 1fr 1fr 1fr')}>
                <Field label="After dip (L)" error={errs?.afterDip?.message}>
                  <NumberInput
                    aria-label={`After dip, line ${i + 1}`}
                    {...register(`lines.${i}.afterDip`)}
                  />
                </Field>
                <Field label="Dip time">
                  <TextInput
                    type="time"
                    aria-label={`After dip time, line ${i + 1}`}
                    {...register(`lines.${i}.afterDipTime`)}
                  />
                </Field>
                <Field label="Sales during (L)" hint="Sold while unloading">
                  <NumberInput
                    aria-label={`Sales during, line ${i + 1}`}
                    {...register(`lines.${i}.salesDuring`)}
                  />
                </Field>
                <Field label="Received">
                  <div style={{ paddingTop: 8, fontWeight: 600 }}>{fmtLitres(received)}</div>
                </Field>
              </div>
            ) : (
              <Chip size="sm" tone="info">
                Pending measurement: next Tank Dip
              </Chip>
            )}
            {early && <Notice tone="warning">{early.message}. It will be flagged.</Notice>}
          </div>
        );
      })}
    </>
  );
};

export const AfterSummary: React.FC<StepProps> = ({ values, tanks, review }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {values.lines.map((l, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 140 }}>
          <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
        </span>
        {l.doAfterDip ? (
          <KV
            items={[
              ['After', l.afterDip ? fmtLitres(Number(l.afterDip)) : '—'],
              ['Sales during', fmtLitres(Number(l.salesDuring || 0))],
              ['Received', fmtLitres(review.lines[i]?.received)],
            ]}
          />
        ) : (
          <Chip size="sm" tone="info">
            Pending measurement: next Tank Dip
          </Chip>
        )}
      </div>
    ))}
  </div>
);

/* ── 6 · Review ────────────────────────────────────────────────────────── */

export const ReviewStep: React.FC<StepProps> = ({ values, tanks, flags, review }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Per invoice</div>
      {review.invoices.length === 0 && review.unlinkedProductIds.length === 0 && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No invoices linked.</span>
      )}
      {review.invoices.map((inv) => (
        <div key={inv.productId} style={{ marginBottom: 6 }}>
          <KV
            items={[
              ['Product', tanks.find((t) => t.productId === inv.productId)?.productName ?? '—'],
              ['Invoice', fmtLitres(inv.invoiceQty)],
              ['Received', inv.received != null ? fmtLitres(inv.received) : 'Pending measurement'],
              [
                'Variance',
                inv.variance == null ? (
                  '—'
                ) : (
                  <Chip size="sm" tone={inv.outOfTolerance ? 'danger' : 'success'}>
                    {inv.variance === 0
                      ? 'Matches'
                      : `${inv.variance > 0 ? 'Excess' : 'Short'} ${fmtSignedLitres(inv.variance)}`}
                  </Chip>
                ),
              ],
            ]}
          />
        </div>
      ))}
      {review.unlinkedProductIds.map((p) => (
        <Chip key={p} size="sm" tone="warning">
          {tanks.find((t) => t.productId === p)?.productName}: purchase not linked
        </Chip>
      ))}
    </div>
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Per tank</div>
      {values.lines.map((l, i) => {
        const r = review.lines[i];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span style={{ width: 140 }}>
              <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
            </span>
            <KV
              items={[
                ['Before', fmtLitres(r?.beforeDip)],
                ['Received', r?.received != null ? fmtLitres(r.received) : 'Pending'],
                ['Stock after', r?.afterDip != null ? fmtLitres(r.afterDip) : 'Next Tank Dip'],
              ]}
            />
          </div>
        );
      })}
    </div>
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Flags</div>
      {flags.flags.length === 0 ? (
        <Chip size="sm" tone="success">
          Nothing flagged
        </Chip>
      ) : (
        flags.flags.map((f, i) => (
          <Notice key={i} tone="danger">
            {f.message}
          </Notice>
        ))
      )}
    </div>
  </div>
);
