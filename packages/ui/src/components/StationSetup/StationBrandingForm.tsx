import React, { useId, useRef } from 'react';
import type { Station } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { submitSection } from '../../forms/submitSection.js';
import {
  Button,
  Form,
  Panel,
  SectionHeader,
  SectionSaveError,
  useUnsavedSection,
} from '../../pump-ds/index.js';
import { Field, Select, TextInput } from '../primitives/Field.js';
import {
  stationBrandingBody,
  stationBrandingSchema,
  stationBrandingValues,
  type StationBrandingValues,
} from './stationForms.js';

export interface StationBrandingFormProps {
  station: Station;
  /**
   * Sends the body under the form's key; resolves with the saved station.
   * The body is built from the latest saved station, not this render's prop,
   * so a section saved just before (one bar, several sections) is kept.
   */
  onSave: (build: (saved: Station) => ReturnType<typeof stationBrandingBody>) => Promise<Station>;
  /** Discard: renew the form's key session. */
  onDiscard: () => void;
}

/**
 * Station › Branding (#604): the letterhead on reports and invoices, an
 * always-on form on React Hook Form + Zod whose changes show in the tab's
 * unsaved-changes bar.
 */
export const StationBrandingForm: React.FC<StationBrandingFormProps> = ({
  station,
  onSave,
  onDiscard,
}) => {
  const ids = useId();
  const fid = (name: string) => `${ids}-${name}`;
  const logoInputRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useZodForm<StationBrandingValues>(stationBrandingSchema, {
    defaultValues: stationBrandingValues(station),
  });
  const logoDataUrl = watch('logoDataUrl');
  const setLogo = (url: string | null) => setValue('logoDataUrl', url, { shouldDirty: true });

  const section = useUnsavedSection('branding', {
    label: 'Business, tax and branding',
    dirty: isDirty,
    submit: () =>
      submitSection(handleSubmit, async (values) => {
        const updated = await onSave((saved) => stationBrandingBody(saved, values));
        reset(stationBrandingValues(updated));
      }),
    discard: () => {
      reset();
      onDiscard();
    },
  });

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Business, tax and branding"
        subtitle="The letterhead on reports and invoices"
      />
      <SectionSaveError error={section.error} />
      <Panel>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            return section.save();
          }}
          aria-label="Business, tax and branding"
          className="flex max-w-[600px] flex-col gap-3"
        >
          <h3 className="text-[12px] font-semibold text-ink-strong">
            Legal and tax (report letterhead)
          </h3>
          <div className="grid grid-cols-2 gap-x-4">
            <Field
              label="Legal / trade name"
              htmlFor={fid('legal-name')}
              error={errors.legalName?.message}
            >
              <TextInput
                id={fid('legal-name')}
                placeholder="e.g. Sri Lakshmi Fuels"
                invalid={!!errors.legalName}
                {...register('legalName')}
              />
            </Field>
            <Field label="GSTIN" htmlFor={fid('gstin')} error={errors.gstin?.message}>
              <TextInput
                id={fid('gstin')}
                className="font-mono uppercase"
                placeholder="29ABCDE1234F1Z5"
                maxLength={15}
                invalid={!!errors.gstin}
                {...register('gstin')}
              />
            </Field>
            <Field
              label="State code (place of supply)"
              htmlFor={fid('state')}
              error={errors.stateCode?.message}
            >
              <TextInput
                id={fid('state')}
                className="font-mono"
                placeholder="e.g. 29 (Karnataka)"
                maxLength={2}
                invalid={!!errors.stateCode}
                {...register('stateCode')}
              />
            </Field>
            <Field
              label="Retail outlet / dealer code"
              htmlFor={fid('ro')}
              error={errors.roCode?.message}
            >
              <TextInput
                id={fid('ro')}
                placeholder="RO / dealership code"
                invalid={!!errors.roCode}
                {...register('roCode')}
              />
            </Field>
            <Field
              label="Address line"
              htmlFor={fid('address')}
              error={errors.legalAddress?.message}
            >
              <TextInput
                id={fid('address')}
                placeholder="Street, area, city"
                invalid={!!errors.legalAddress}
                {...register('legalAddress')}
              />
            </Field>
            <Field label="Pincode" htmlFor={fid('pincode')} error={errors.pincode?.message}>
              <TextInput
                id={fid('pincode')}
                className="font-mono"
                placeholder="560001"
                maxLength={6}
                invalid={!!errors.pincode}
                {...register('pincode')}
              />
            </Field>
          </div>

          <h3 className="border-t border-border-soft pt-3 text-[12px] font-semibold text-ink-strong">
            Branding
          </h3>
          <div className="grid grid-cols-2 gap-x-4">
            <Field label="Fuel company / brand" htmlFor={fid('brand')}>
              <Select id={fid('brand')} {...register('fuelBrand')}>
                <option value="">— Select —</option>
                <option value="Indian Oil">Indian Oil (IOCL)</option>
                <option value="Bharat Petroleum">Bharat Petroleum (BPCL)</option>
                <option value="Hindustan Petroleum">Hindustan Petroleum (HPCL)</option>
                <option value="Nayara Energy">Nayara Energy</option>
                <option value="Jio-bp">Jio-bp (Reliance)</option>
                <option value="Shell">Shell</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
            <Field
              label="Logo (optional, your own)"
              hint="Upload your outlet's own logo. Used on report letterheads."
            >
              <div className="flex items-center gap-2.5">
                {logoDataUrl && (
                  <img
                    src={logoDataUrl}
                    alt="logo"
                    className="size-9 rounded border border-border-soft object-contain"
                  />
                )}
                <input
                  type="file"
                  aria-label="Logo file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  ref={logoInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setLogo(typeof reader.result === 'string' ? reader.result : null);
                    reader.readAsDataURL(file);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoDataUrl ? 'Replace' : 'Upload logo'}
                </Button>
                {logoDataUrl && (
                  <Button type="button" variant="ghost" size="xs" onClick={() => setLogo(null)}>
                    Remove
                  </Button>
                )}
              </div>
            </Field>
          </div>
          <p className="text-[12px] text-ink-muted">
            Report paper size and which sections print on each report are set in Station › Report
            templates.
          </p>
        </Form>
      </Panel>
    </section>
  );
};
