import React from 'react';
import { Field, NumberInput } from '../primitives/Field.js';
import { useZodForm } from '../../forms/useZodForm.js';
import { submitSection } from '../../forms/submitSection.js';
import { RULES_FORM, RULES_FORM_GRID } from './rulesForm.js';
import { tankVarianceLimitSchema, type TankVarianceLimitValues } from './stationForms.js';
import {
  Form,
  Panel,
  SectionHeader,
  SectionSaveError,
  useUnsavedSection,
} from '../../pump-ds/index.js';

export interface TankVarianceLimitPanelProps {
  value: number;
  canEdit: boolean;
  onSave: (value: number) => Promise<void>;
  onDiscard?: () => void;
}

export const TankVarianceLimitPanel: React.FC<TankVarianceLimitPanelProps> = ({
  value,
  canEdit,
  onSave,
  onDiscard,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useZodForm<TankVarianceLimitValues>(tankVarianceLimitSchema, {
    defaultValues: { tolerancePct: value },
  });
  const section = useUnsavedSection('stock-variance', {
    label: 'Tank variance limit',
    dirty: isDirty,
    submit: () =>
      submitSection(handleSubmit, async (next) => {
        await onSave(next.tolerancePct);
        reset(next);
      }),
    discard: () => {
      reset();
      onDiscard?.();
    },
  });
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Tank variance limit" />
      <SectionSaveError error={section.error} />
      <Panel>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            return section.save();
          }}
          aria-label="Tank variance limit"
          className={RULES_FORM}
        >
          <p className="text-[12px] text-ink-muted">Default 0.5%. Used by Stock loss insights.</p>
          <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
            <div className={RULES_FORM_GRID}>
              <Field
                label="Tank variance limit (% of litres sold)"
                htmlFor="tank-variance-limit"
                error={errors.tolerancePct?.message}
              >
                <NumberInput
                  id="tank-variance-limit"
                  min={0}
                  max={5}
                  step="0.01"
                  invalid={!!errors.tolerancePct}
                  {...register('tolerancePct', { valueAsNumber: true })}
                />
              </Field>
            </div>
          </fieldset>
          {!canEdit && (
            <p className="text-[12px] text-ink-muted">
              Only an Owner or Manager can change the tank variance limit.
            </p>
          )}
        </Form>
      </Panel>
    </section>
  );
};
