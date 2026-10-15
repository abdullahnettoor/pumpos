import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEFAULT_TANK_LEVEL_SETTINGS,
  tankLevelSettingsSchema,
  type TankLevelSettings,
} from '@pump/shared';
import { Field, NumberInput } from '../primitives/Field.js';
import { Button, Form, Panel, SectionHeader } from '../../pump-ds/index.js';

export interface TankLevelSettingsPanelProps {
  /** The station's resolved thresholds (`resolveTankLevelSettings`). */
  value: TankLevelSettings;
  /** Owner / Manager (`canManageTankLevels`); everyone else sees the values read-only. */
  canEdit: boolean;
  /** Persists the thresholds and reports its own failure; rejects so the edit stays unsaved. */
  onSave: (next: TankLevelSettings) => Promise<void>;
}

/**
 * Station business rule (#520): when a tank turns low or critical. The same
 * thresholds colour the Dashboard, the alerts bell, Inventory and mobile.
 */
export const TankLevelSettingsPanel: React.FC<TankLevelSettingsPanelProps> = ({
  value,
  canEdit,
  onSave,
}) => {
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<TankLevelSettings>({
    resolver: zodResolver(tankLevelSettingsSchema),
    defaultValues: value,
  });

  const submit = handleSubmit(async (next) => {
    try {
      await onSave(next);
      reset(next);
    } catch {
      // `onSave` reports the failure; the edit stays dirty so it can be retried.
    }
  });

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Tank levels" subtitle="Dashboard, alerts, Inventory and mobile" />
      <Panel>
        <Form
          onSubmit={submit}
          onSubmittingChange={setSaving}
          aria-label="Tank levels"
          className="flex max-w-[520px] flex-col gap-3"
        >
          <p className="text-[12px] text-ink-muted">
            When a tank reads critical or low, as a percent of its capacity. Defaults: critical
            below {DEFAULT_TANK_LEVEL_SETTINGS.criticalBelowPct}%, low below{' '}
            {DEFAULT_TANK_LEVEL_SETTINGS.lowBelowPct}%.
          </p>
          <fieldset disabled={!canEdit || saving} className="m-0 min-w-0 border-0 p-0">
            <div className="grid grid-cols-2 gap-x-4">
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
          {canEdit ? (
            <div className="flex justify-end border-t border-border-soft pt-3">
              <Button type="submit" variant="primary" size="sm" disabled={!isDirty || saving}>
                Save tank levels
              </Button>
            </div>
          ) : (
            <p className="text-[12px] text-ink-muted">
              Only an Owner or Manager can change tank levels.
            </p>
          )}
        </Form>
      </Panel>
    </section>
  );
};
