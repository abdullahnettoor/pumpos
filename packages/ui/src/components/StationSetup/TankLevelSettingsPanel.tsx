import React from 'react';
import {
  DEFAULT_TANK_LEVEL_SETTINGS,
  tankLevelSettingsSchema,
  type TankLevelSettings,
} from '@pump/shared';
import { Field, NumberInput } from '../primitives/Field.js';
import { useZodForm } from '../../forms/useZodForm.js';
import { submitSection } from '../../forms/submitSection.js';
import { RULES_FORM, RULES_FORM_GRID } from './rulesForm.js';
import {
  Form,
  Panel,
  SectionHeader,
  SectionSaveError,
  useUnsavedSection,
} from '../../pump-ds/index.js';

export interface TankLevelSettingsPanelProps {
  /** The station's resolved thresholds (`resolveTankLevelSettings`). */
  value: TankLevelSettings;
  /** Owner / Manager (`canManageTankLevels`); everyone else sees the values read-only. */
  canEdit: boolean;
  /** Persists the thresholds; rejects (the section shows why) so the edit stays unsaved. */
  onSave: (next: TankLevelSettings) => Promise<void>;
  /** Discard: renew the form's key session (#604). */
  onDiscard?: () => void;
}

/**
 * Station business rule (#520): when a tank turns low or critical. The same
 * thresholds colour the Dashboard, the alerts bell, Inventory and mobile.
 * A section of its tab's unsaved-changes bar (#604): render it inside an
 * `UnsavedSectionsProvider`, with the tab's `UnsavedSectionsBar`.
 */
export const TankLevelSettingsPanel: React.FC<TankLevelSettingsPanelProps> = ({
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
  } = useZodForm<TankLevelSettings>(tankLevelSettingsSchema, { defaultValues: value });

  const section = useUnsavedSection('tank-levels', {
    label: 'Tank levels',
    dirty: isDirty,
    submit: () =>
      submitSection(handleSubmit, async (next) => {
        await onSave(next);
        reset(next);
      }),
    discard: () => {
      reset();
      onDiscard?.();
    },
  });

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Tank levels" subtitle="Dashboard, alerts, Inventory and mobile" />
      <SectionSaveError error={section.error} />
      <Panel>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            return section.save();
          }}
          aria-label="Tank levels"
          className={RULES_FORM}
        >
          <p className="text-[12px] text-ink-muted">
            When a tank reads critical or low, as a percent of its capacity. Defaults: critical
            below {DEFAULT_TANK_LEVEL_SETTINGS.criticalBelowPct}%, low below{' '}
            {DEFAULT_TANK_LEVEL_SETTINGS.lowBelowPct}%.
          </p>
          <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
            <div className={RULES_FORM_GRID}>
              <Field
                label="Critical below (%)"
                htmlFor="tank-critical-below"
                error={errors.criticalBelowPct?.message}
              >
                <NumberInput
                  id="tank-critical-below"
                  max={100}
                  invalid={!!errors.criticalBelowPct}
                  {...register('criticalBelowPct', { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Low below (%)"
                htmlFor="tank-low-below"
                error={errors.lowBelowPct?.message}
              >
                <NumberInput
                  id="tank-low-below"
                  max={100}
                  invalid={!!errors.lowBelowPct}
                  {...register('lowBelowPct', { valueAsNumber: true })}
                />
              </Field>
            </div>
          </fieldset>
          {!canEdit && (
            <p className="text-[12px] text-ink-muted">
              Only an Owner or Manager can change tank levels.
            </p>
          )}
        </Form>
      </Panel>
    </section>
  );
};
