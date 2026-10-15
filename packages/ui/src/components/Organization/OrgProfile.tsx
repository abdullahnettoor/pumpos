import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { organizationUpdateSchema, type OrganizationUpdateValues } from '@pump/shared';
import { useOrganization, queryKeys } from '../../query/hooks.js';
import { CloudOrganizationService } from '../../services/cloud.js';
import { useZodForm } from '../../forms/useZodForm.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { Field, TextInput } from '../primitives/Field.js';
import { Button, DataSection, Form, SectionHeader } from '../../pump-ds/index.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';

const orgService = new CloudOrganizationService();

const EMPTY: OrganizationUpdateValues = {
  name: '',
  metadata: { legalName: '', gstin: '', pan: '', stateCode: '', address: '', phone: '', email: '' },
};

/**
 * Owner-editable organization profile: the org's display name plus legal /
 * branding metadata (stored in organizations.metadata jsonb). Station-level
 * legal details remain in Station. The form waits in its Data Section until
 * the organization has loaded, so it never opens blank over saved details.
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
    formState: { errors, isSubmitting },
  } = useZodForm<OrganizationUpdateValues>(organizationUpdateSchema, { defaultValues: EMPTY });

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

  const onSubmit = async (values: OrganizationUpdateValues) => {
    try {
      await save(values, (idempotencyKey) =>
        orgService.updateOrganization(values, { idempotencyKey }),
      );
    } catch (e: any) {
      toast.error(e.message || 'Failed to update organization');
      return;
    }
    toast.success('Organization updated.');
    runTask(
      qc.invalidateQueries({ queryKey: queryKeys.organization() }),
      'Saved, but the profile could not be refreshed.',
    );
  };

  const metaErrors = errors.metadata ?? {};

  return (
    <section className="flex max-w-[560px] flex-col gap-2">
      <SectionHeader title="Organization profile" subtitle="Shown on invoices and reports" />
      <DataSection title="organization profile" query={orgQ} placeholderHeight={420}>
        <Form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
          <Field label="Organization name" required error={errors.name?.message}>
            <TextInput
              {...register('name')}
              invalid={!!errors.name}
              placeholder="e.g. Sri Lakshmi Fuels"
            />
          </Field>
          <Field label="Legal / trade name" hint="As printed on the GST certificate.">
            <TextInput {...register('metadata.legalName')} />
          </Field>
          <Field label="GSTIN">
            <TextInput
              {...register('metadata.gstin')}
              maxLength={15}
              placeholder="29ABCDE1234F1Z5"
              className="font-mono"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PAN">
              <TextInput {...register('metadata.pan')} maxLength={10} className="font-mono" />
            </Field>
            <Field label="State code">
              <TextInput {...register('metadata.stateCode')} maxLength={2} placeholder="29" />
            </Field>
          </div>
          <Field label="Registered address">
            <TextInput {...register('metadata.address')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <TextInput {...register('metadata.phone')} />
            </Field>
            <Field label="Email" error={metaErrors.email?.message}>
              <TextInput {...register('metadata.email')} invalid={!!metaErrors.email} />
            </Field>
          </div>
          <div>
            <Button type="submit" variant="secondary" size="md" loading={isSubmitting}>
              Save changes
            </Button>
          </div>
        </Form>
      </DataSection>
    </section>
  );
};
