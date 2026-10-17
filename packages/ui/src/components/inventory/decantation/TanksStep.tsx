import React from 'react';
import { useFieldArray } from 'react-hook-form';
import { Button, Chip, Icon } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import { Field, NumberInput, Select } from '../../primitives/Field.js';
import { DensityCalculatorPopover } from '../../primitives/DensityCalculatorPopover.js';
import { KV, LineTag, Notice } from './StepSection.js';
import { chambersAfterLineRemoved, emptyLine } from './decantationForm.js';
import { formatDensity, formatQuantity } from '../../../utils/format.js';
import { bookStock } from './bookStock.js';
import { GRID, lineBorder, lineLabel, tankOf, SummaryCard, type StepProps } from './stepShared.js';

export const TanksStep: React.FC<
  StepProps & { invoiceDensityByProduct: Record<string, number | null | undefined> }
> = ({ form, values, tanks, settings, flags, invoiceDensityByProduct }) => {
  const { register, formState, setValue, control, getValues } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const used = new Set(values.lines.map((l) => l.tankId));
  const removeLine = (i: number) => {
    // A Decantation keeps at least one tank line. Chambers on the removed line become unassigned.
    if (fields.length <= 1) return;
    setValue('chambers', chambersAfterLineRemoved(getValues('chambers'), i));
    remove(i);
  };
  return (
    <>
      <div className="mb-2.5 text-[12px] text-ink-muted">
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
            className={cn('mb-3.5 border-l-[3px] pb-0.5 pl-3 pt-2', lineBorder(i))}
          >
            <div className="mb-2 flex items-center justify-between">
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
            <div className={GRID[3]}>
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
                required
                error={errs?.beforeDip?.message}
                hint={tank ? bookStock(tank) : undefined}
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
                hint={
                  invoiceDensity != null ? `Invoice ${formatDensity(invoiceDensity)}` : undefined
                }
              >
                <div className="flex items-center gap-1.5">
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
  <SummaryCard>
    {values.lines.map((l, i) => {
      const f = flags.flags.find(
        (x) => x.code === 'DENSITY_OUT_OF_TOLERANCE' && x.tankLineId === String(i),
      );
      return (
        <div key={i} className="flex items-center gap-3">
          <span className="w-[140px] shrink-0">
            <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
          </span>
          <KV
            items={[
              ['Before', l.beforeDip ? formatQuantity(Number(l.beforeDip), 'L') : '—'],
              ['RO density', l.roDensity ? formatDensity(Number(l.roDensity)) : '—'],
              ...(f
                ? ([
                    [
                      'Density',
                      <Chip key="d" size="md" tone="danger">
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
  </SummaryCard>
);
