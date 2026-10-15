import React, { useId } from 'react';
import type { Station } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { submitSection } from '../../forms/submitSection.js';
import {
  Chip,
  Form,
  Panel,
  SectionHeader,
  SectionSaveError,
  useUnsavedSection,
} from '../../pump-ds/index.js';
import { Field, NumberInput, Select, TextInput } from '../primitives/Field.js';
import {
  stationGeneralBody,
  stationGeneralSchema,
  stationGeneralValues,
  type StationGeneralValues,
} from './stationForms.js';

export interface StationDetailsFormProps {
  station: Station;
  /** Sends the body under the form's key; resolves with the saved station. */
  onSave: (body: ReturnType<typeof stationGeneralBody>) => Promise<Station>;
  /** Discard: renew the form's key session. */
  onDiscard: () => void;
}

const ONBOARDING_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  READY_FOR_OPERATIONS: 'Ready for operations',
};

/**
 * Station › General (#604): an always-on form on React Hook Form + Zod. Its
 * changes show in the tab's unsaved-changes bar. The onboarding status is
 * read-only here: a status chip in the heading.
 */
export const StationDetailsForm: React.FC<StationDetailsFormProps> = ({
  station,
  onSave,
  onDiscard,
}) => {
  const ids = useId();
  const fid = (name: string) => `${ids}-${name}`;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useZodForm<StationGeneralValues>(stationGeneralSchema, {
    defaultValues: stationGeneralValues(station),
  });

  const section = useUnsavedSection('general', {
    label: 'Station details',
    dirty: isDirty,
    submit: () =>
      submitSection(handleSubmit, async (values) => {
        const updated = await onSave(stationGeneralBody(station, values));
        // The saved station is the new baseline (the code comes back upper-case).
        reset(stationGeneralValues(updated));
      }),
    discard: () => {
      reset();
      onDiscard();
    },
  });

  const status = station.onboardingStatus || 'NOT_STARTED';

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Station details"
        controls={{
          actions: (
            <Chip tone={status === 'READY_FOR_OPERATIONS' ? 'success' : 'neutral'} size="md">
              {ONBOARDING_LABEL[status] ?? status.replace(/_/g, ' ').toLowerCase()}
            </Chip>
          ),
        }}
      />
      <SectionSaveError error={section.error} />
      <Panel>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            return section.save();
          }}
          aria-label="Station details"
          className="flex max-w-[600px] flex-col gap-1"
        >
          <div className="grid grid-cols-2 gap-x-4">
            <Field label="Station name" required htmlFor={fid('name')} error={errors.name?.message}>
              <TextInput id={fid('name')} invalid={!!errors.name} {...register('name')} />
            </Field>
            <Field label="Station code" required htmlFor={fid('code')} error={errors.code?.message}>
              <TextInput
                id={fid('code')}
                className="uppercase"
                invalid={!!errors.code}
                {...register('code')}
              />
            </Field>
          </div>
          <Field label="Address" htmlFor={fid('address')} error={errors.address?.message}>
            <TextInput id={fid('address')} invalid={!!errors.address} {...register('address')} />
          </Field>
          <div className="grid grid-cols-2 gap-x-4">
            <Field label="Contact phone" htmlFor={fid('phone')} error={errors.phone?.message}>
              <TextInput id={fid('phone')} invalid={!!errors.phone} {...register('phone')} />
            </Field>
            <Field
              label="Shift grace period (minutes)"
              htmlFor={fid('grace')}
              error={errors.graceMinutes?.message}
            >
              <NumberInput
                id={fid('grace')}
                invalid={!!errors.graceMinutes}
                {...register('graceMinutes', { valueAsNumber: true })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Field
              label="Timezone"
              htmlFor={fid('timezone')}
              hint="Used to decide which calendar day operations belong to."
              error={errors.timezone?.message}
            >
              <Select id={fid('timezone')} {...register('timezone')}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Asia/Colombo">Asia/Colombo</option>
                <option value="Asia/Kathmandu">Asia/Kathmandu</option>
                <option value="Asia/Dhaka">Asia/Dhaka</option>
                <option value="UTC">UTC</option>
              </Select>
            </Field>
            <Field
              label="Business day starts at"
              htmlFor={fid('day-start')}
              hint="A fuel day commonly runs 06:00 → 06:00. Activity before this rolls to the previous day."
              error={errors.businessDayStartsAt?.message}
            >
              <TextInput
                id={fid('day-start')}
                type="time"
                className="font-mono"
                invalid={!!errors.businessDayStartsAt}
                {...register('businessDayStartsAt')}
              />
            </Field>
          </div>
        </Form>
      </Panel>
    </section>
  );
};
