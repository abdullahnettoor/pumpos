import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { organizationUpdateSchema, type OrganizationUpdateValues } from '@pump/shared';
import { useOrganization, queryKeys } from '../../query/hooks.js';
import { CloudOrganizationService } from '../../services/cloud.js';
import { useZodForm } from '../../forms/useZodForm.js';
import { Field, TextInput } from '../primitives/Field.js';
import { useToast } from '../primitives/ToastProvider.js';

const orgService = new CloudOrganizationService();

const EMPTY: OrganizationUpdateValues = {
  name: '',
  metadata: { legalName: '', gstin: '', pan: '', stateCode: '', address: '', phone: '', email: '' },
};

/**
 * Owner-editable organization profile: the org's display name plus legal /
 * branding metadata (stored in organizations.metadata jsonb). Station-level
 * legal details remain in Station Overview.
 */
export const OrgProfile: React.FC = () => {
  const { data: org, isLoading } = useOrganization();
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useZodForm<OrganizationUpdateValues>(organizationUpdateSchema, { defaultValues: EMPTY });

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
      await orgService.updateOrganization(values);
      await qc.invalidateQueries({ queryKey: queryKeys.organization() });
      toast.success('Organization updated.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to update organization');
    }
  };

  if (isLoading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading organization…</div>;
  }

  const metaErrors = (errors.metadata as any) || {};

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 520, display: 'flex', flexDirection: 'column' }}>
      <Field label="Organization name" required error={errors.name?.message}>
        <TextInput {...register('name')} invalid={!!errors.name} placeholder="e.g. Sri Lakshmi Fuels" />
      </Field>
      <Field label="Legal / trade name" hint="As printed on the GST certificate.">
        <TextInput {...register('metadata.legalName')} />
      </Field>
      <Field label="GSTIN">
        <TextInput {...register('metadata.gstin')} maxLength={15} placeholder="29ABCDE1234F1Z5" style={{ fontFamily: 'var(--font-mono)' }} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <Field label="PAN">
          <TextInput {...register('metadata.pan')} maxLength={10} style={{ fontFamily: 'var(--font-mono)' }} />
        </Field>
        <Field label="State code">
          <TextInput {...register('metadata.stateCode')} maxLength={2} placeholder="29" />
        </Field>
      </div>
      <Field label="Registered address">
        <TextInput {...register('metadata.address')} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <Field label="Phone">
          <TextInput {...register('metadata.phone')} />
        </Field>
        <Field label="Email" error={metaErrors.email?.message}>
          <TextInput {...register('metadata.email')} invalid={!!metaErrors.email} />
        </Field>
      </div>
      <div style={{ marginTop: 'var(--space-2)' }}>
        <button type="submit" className="btn btn-primary btn-md" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
};
