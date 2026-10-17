import React, { useEffect, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganization, queryKeys } from '../../query/hooks.js';
import { CloudOrganizationService } from '../../services/cloud.js';
import { useZodForm } from '../../forms/useZodForm.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { Field, TextInput } from '../primitives/Field.js';
import {
  DataSection,
  Form,
  SectionHeader,
  UnsavedChangesBar,
  useUnsavedChangesGuard,
} from '../../pump-ds/index.js';
import {
  autofillStateCode,
  orgProfileSchema,
  type OrgProfileBody,
  type OrgProfileValues,
} from './orgProfileForm.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';

const orgService = new CloudOrganizationService();

const EMPTY: OrgProfileValues = {
  name: '',
  metadata: { legalName: '', gstin: '', pan: '', stateCode: '', address: '', phone: '', email: '' },
};

/**
 * Owner-editable organization profile: the org's display name plus legal /
 * branding metadata (stored in organizations.metadata jsonb), in Legal and
 * Contact groups (#605). Printed letterheads use each station's Branding, so
 * the letterhead preview lives in Station › Branding (#615 review).
 * The GSTIN and PAN are checked and the state code is read from the GSTIN
 * (`orgProfileForm`). Station-level legal details remain in Station. The form
 * waits in its Data Section until
 * the organization has loaded, so it never opens blank over saved details.
 * Save lives in the unsaved-changes bar, which shows only once a field is
 * changed (#604); Discard puts the saved details back.
 */
export const OrgProfile: React.FC = () => {
  const orgQ = useOrganization();
  const org = orgQ.data;
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  // One submit key per visit to the form; a saved answer renews it.
  const save = useKeyedSave('organization:update');
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useZodForm<OrgProfileValues>(orgProfileSchema, { defaultValues: EMPTY });
  const ids = useId();
  const fid = (name: string) => `${ids}-${name}`;

  useEffect(() => {
    if (!org) return;
    const m = org.metadata || {};
    reset({
      name: org.name ?? '',
      metadata: {
        legalName: m.legalName ?? '',
        gstin: m.gstin ?? '',
        pan: m.pan ?? '',
        stateCode: m.stateCode ?? '',
        address: m.address ?? '',
        phone: m.phone ?? '',
        email: m.email ?? '',
      },
    });
  }, [org, reset]);

  // The resolver hands over the parsed values: GSTIN and PAN upper-case, and
  // the GSTIN's state code when none was given.
  const onSubmit = async (body: OrgProfileValues) => {
    const values = body as OrgProfileBody;
    try {
      await save(values, (idempotencyKey) =>
        orgService.updateOrganization(values, { idempotencyKey }),
      );
    } catch (e: any) {
      toast.error(
        withNextStep(
          e.message || "Couldn't update the organization",
          'Check the details and save again.',
        ),
      );
      return;
    }
    // The saved values are the form's new baseline: the bar goes away now,
    // not when the refetch lands.
    reset(values);
    toast.success('Organization updated.');
    runTask(
      qc.invalidateQueries({ queryKey: queryKeys.organization() }),
      'Saved, but the profile could not be refreshed.',
    );
  };

  // Discard puts the saved details back and starts a new submit, so a save
  // left unsettled never lends its key to a fresh edit (#604 review).
  const discard = () => {
    reset();
    save.renew();
  };
  // Leaving the page, the tab or the window with changes asks first.
  useUnsavedChangesGuard(isDirty, discard);

  const metaErrors = errors.metadata ?? {};

  // The state code follows the GSTIN while it is blank or was filled from it
  // (`autofillStateCode`): read the GSTIN before the change, then after.
  const gstinField = register('metadata.gstin');
  const onGstinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const previous = getValues('metadata.gstin');
    void gstinField.onChange(e);
    const current = getValues('metadata.stateCode') ?? '';
    const code = autofillStateCode(previous, e.target.value, current);
    if (code !== current) setValue('metadata.stateCode', code, { shouldDirty: true });
  };

  return (
    <section className="flex max-w-[560px] flex-col gap-2">
      <SectionHeader title="Organization profile" subtitle="Legal and contact details" />
      <DataSection
        title="organization profile"
        query={orgQ}
        placeholderHeight={420}
        // Unclipped, so the unsaved-changes bar can stick (#604).
        className="overflow-visible"
      >
        <Form
          onSubmit={handleSubmit(onSubmit)}
          aria-label="Organization profile"
          className="flex flex-col gap-4"
        >
          <FieldGroup legend="Legal">
            <Field
              label="Organization name"
              htmlFor={fid('name')}
              required
              error={errors.name?.message}
            >
              <TextInput
                id={fid('name')}
                {...register('name')}
                invalid={!!errors.name}
                placeholder="e.g. Sri Lakshmi Fuels"
              />
            </Field>
            <Field
              label="Legal / trade name"
              htmlFor={fid('legal')}
              hint="As printed on the GST certificate."
            >
              <TextInput id={fid('legal')} {...register('metadata.legalName')} />
            </Field>
            <Field label="GSTIN" htmlFor={fid('gstin')} error={metaErrors.gstin?.message}>
              <TextInput
                id={fid('gstin')}
                {...gstinField}
                onChange={onGstinChange}
                invalid={!!metaErrors.gstin}
                maxLength={15}
                placeholder="29ABCDE1234F1ZW"
                className="font-mono uppercase"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="PAN" htmlFor={fid('pan')} error={metaErrors.pan?.message}>
                <TextInput
                  id={fid('pan')}
                  {...register('metadata.pan')}
                  invalid={!!metaErrors.pan}
                  maxLength={10}
                  placeholder="ABCDE1234F"
                  className="font-mono uppercase"
                />
              </Field>
              <Field
                label="State code"
                htmlFor={fid('state')}
                hint="Filled from the GSTIN."
                error={metaErrors.stateCode?.message}
              >
                <TextInput
                  id={fid('state')}
                  {...register('metadata.stateCode')}
                  invalid={!!metaErrors.stateCode}
                  maxLength={2}
                  placeholder="29"
                  className="font-mono"
                />
              </Field>
            </div>
          </FieldGroup>
          <FieldGroup legend="Contact">
            <Field label="Registered address" htmlFor={fid('address')}>
              <TextInput id={fid('address')} {...register('metadata.address')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" htmlFor={fid('phone')}>
                <TextInput id={fid('phone')} {...register('metadata.phone')} />
              </Field>
              <Field label="Email" htmlFor={fid('email')} error={metaErrors.email?.message}>
                <TextInput
                  id={fid('email')}
                  {...register('metadata.email')}
                  invalid={!!metaErrors.email}
                />
              </Field>
            </div>
          </FieldGroup>
          <UnsavedChangesBar
            dirty={isDirty}
            saving={isSubmitting}
            onDiscard={discard}
            saveLabel="Save changes"
          />
        </Form>
      </DataSection>
    </section>
  );
};

/** A titled group of fields: a 12px heading over its fields. */
const FieldGroup: React.FC<{ legend: string; children: React.ReactNode }> = ({
  legend,
  children,
}) => (
  <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
    <legend className="mb-2 p-0 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
      {legend}
    </legend>
    {children}
  </fieldset>
);
