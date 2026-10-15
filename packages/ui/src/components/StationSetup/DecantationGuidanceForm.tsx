import React, { useId } from 'react';
import {
  DECANTATION_REFERENCE_TEMPERATURE_C,
  type DecantationSettings,
  type Product,
  type Station,
} from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { submitSection } from '../../forms/submitSection.js';
import {
  DataSection,
  Form,
  Panel,
  SectionHeader,
  SectionSaveError,
  useUnsavedSection,
  type SectionQuery,
} from '../../pump-ds/index.js';
import { Field, Select, TextInput } from '../primitives/Field.js';
import {
  decantationGuidanceBody,
  decantationGuidanceSchema,
  decantationGuidanceValues,
  withDensityBand,
} from './stationForms.js';

export interface DecantationGuidanceFormProps {
  station: Station;
  /** The station's fuel products, for the density bands. */
  fuelProducts: Product[];
  productsQuery: SectionQuery;
  /** Sends the body under the form's key; resolves with the saved station. */
  onSave: (body: ReturnType<typeof decantationGuidanceBody>) => Promise<Station>;
  /** Discard: renew the form's key session. */
  onDiscard: () => void;
}

/**
 * Station › Rules › Decantation guidance (#604): React Hook Form over the
 * shared decantation settings schema. Flags readings for review; never blocks
 * an operation. Its changes show in the Rules tab's one unsaved-changes bar.
 */
export const DecantationGuidanceForm: React.FC<DecantationGuidanceFormProps> = ({
  station,
  fuelProducts,
  productsQuery,
  onSave,
  onDiscard,
}) => {
  const ids = useId();
  const fid = (name: string) => `${ids}-${name}`;
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useZodForm<DecantationSettings>(decantationGuidanceSchema, {
    defaultValues: decantationGuidanceValues(station),
  });
  const bands = watch('densitySpecBands');

  const section = useUnsavedSection('decantation', {
    label: 'Decantation guidance',
    dirty: isDirty,
    submit: () =>
      submitSection(handleSubmit, async (values) => {
        const updated = await onSave(decantationGuidanceBody(station, values));
        reset(decantationGuidanceValues(updated));
      }),
    discard: () => {
      reset();
      onDiscard();
    },
  });

  const number = { valueAsNumber: true } as const;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Decantation guidance"
        subtitle="Flags readings for review; never blocks an operation"
      />
      <SectionSaveError error={section.error} />
      <Panel>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            return section.save();
          }}
          aria-label="Decantation guidance"
          className="flex max-w-[760px] flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-x-4">
            <Field
              label="Density method"
              htmlFor={fid('method')}
              hint="Used to convert observed density to 15 °C."
            >
              <Select id={fid('method')} {...register('densityMethod')}>
                <option value="API_MPMS_11_1_ADJUNCT">API MPMS 11.1 Adjunct</option>
                <option value="OMC_TABLE_53B">OMC Table 53B</option>
              </Select>
            </Field>
            <Field
              label="Default density entry"
              htmlFor={fid('entry')}
              hint="Pre-selected method when recording a density reading."
            >
              <Select id={fid('entry')} {...register('densityEntryMethod')}>
                <option value="HYDROMETER">Hydrometer + temperature</option>
                <option value="DIRECT_15">Direct 15 °C</option>
              </Select>
            </Field>
            <Field label="Reference temperature">
              <TextInput value={`${DECANTATION_REFERENCE_TEMPERATURE_C} °C`} disabled readOnly />
            </Field>
            <Field
              label="Density tolerance (kg/m³)"
              htmlFor={fid('density-tolerance')}
              hint="Warn when RO density differs from invoice density by more than this value."
              error={errors.densityToleranceKgM3?.message}
            >
              <TextInput
                id={fid('density-tolerance')}
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                className="font-mono"
                invalid={!!errors.densityToleranceKgM3}
                {...register('densityToleranceKgM3', number)}
              />
            </Field>
            <Field
              label="Quantity tolerance (%)"
              htmlFor={fid('quantity-tolerance')}
              hint="Percent of invoice quantity; 0.2 means 0.2%."
              error={errors.quantityTolerance?.message}
            >
              <TextInput
                id={fid('quantity-tolerance')}
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="font-mono"
                invalid={!!errors.quantityTolerance}
                {...register('quantityTolerance', number)}
              />
            </Field>
            <Field
              label="Settling time (minutes)"
              htmlFor={fid('settling')}
              hint="Early post-unloading dips are flagged for review."
              error={errors.settlingTimeMinutes?.message}
            >
              <TextInput
                id={fid('settling')}
                type="number"
                min="0"
                max="1440"
                step="1"
                className="font-mono"
                invalid={!!errors.settlingTimeMinutes}
                {...register('settlingTimeMinutes', number)}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
            <h3 className="text-[12px] font-semibold text-ink-strong">
              Product density bands at 15 °C
            </h3>
            <p className="text-[12px] text-ink-muted">
              Optional product-specific bounds in kg/m³. Leave both fields blank for no band.
            </p>
            {errors.densitySpecBands && (
              <p role="alert" className="text-[12px] text-danger-fg">
                A band's minimum must not be above its maximum.
              </p>
            )}
            <DataSection
              title="fuel products"
              query={productsQuery}
              placeholderHeight={80}
              shape="bare"
              isEmpty={fuelProducts.length === 0}
              empty={
                <p className="text-[12px] text-ink-muted">
                  No fuel products are set up for this station.
                </p>
              }
            >
              {fuelProducts.map((product) => {
                const band = bands[product.id] ?? {};
                const setBand = (edge: 'minKgM3' | 'maxKgM3', raw: string) =>
                  setValue('densitySpecBands', withDensityBand(bands, product.id, edge, raw), {
                    shouldDirty: true,
                    shouldValidate: !!errors.densitySpecBands,
                  });
                return (
                  <div
                    key={product.id}
                    className="grid grid-cols-[minmax(180px,1fr)_1fr_1fr] items-end gap-3"
                  >
                    <span className="pb-6 text-[13px] text-ink">{product.name}</span>
                    <Field label="Minimum (kg/m³)">
                      <TextInput
                        type="number"
                        min="0"
                        step="0.1"
                        className="font-mono"
                        aria-label={`${product.name} minimum density`}
                        value={band.minKgM3 ?? ''}
                        onChange={(e) => setBand('minKgM3', e.target.value)}
                      />
                    </Field>
                    <Field label="Maximum (kg/m³)">
                      <TextInput
                        type="number"
                        min="0"
                        step="0.1"
                        className="font-mono"
                        aria-label={`${product.name} maximum density`}
                        value={band.maxKgM3 ?? ''}
                        onChange={(e) => setBand('maxKgM3', e.target.value)}
                      />
                    </Field>
                  </div>
                );
              })}
            </DataSection>
          </div>
        </Form>
      </Panel>
    </section>
  );
};
