import React from 'react';
import { useFieldArray } from 'react-hook-form';
import { Button, Chip, Icon } from '../../../pump-ds/index.js';
import { Field, NumberInput, Select } from '../../primitives/Field.js';
import { DensityCalculatorPopover } from '../../primitives/DensityCalculatorPopover.js';
import { KV, LINE_COLORS, LineTag, Notice } from './StepSection.js';
import { emptyLine } from './decantationForm.js';
import { fmtLitres } from './format.js';
import { grid, lineLabel, tankOf, SummaryCard, type StepProps } from './stepShared.js';

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
                required
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
  <SummaryCard>
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
  </SummaryCard>
);
