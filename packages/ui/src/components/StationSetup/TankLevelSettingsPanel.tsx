import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEFAULT_TANK_LEVEL_SETTINGS,
  tankLevelSettingsSchema,
  type TankLevelSettings,
} from '@pump/shared';
import { Field, NumberInput } from '../primitives/Field.js';
import { Button, Form } from '../../pump-ds/index.js';

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
    <Form
      onSubmit={submit}
      onSubmittingChange={setSaving}
      aria-label="Tank levels"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '520px' }}
    >
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
          Tank levels
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          When a tank reads critical or low, as a percent of its capacity. Used by the Dashboard,
          alerts, Inventory and the mobile app. Defaults: critical below{' '}
          {DEFAULT_TANK_LEVEL_SETTINGS.criticalBelowPct}%, low below{' '}
          {DEFAULT_TANK_LEVEL_SETTINGS.lowBelowPct}%.
        </p>
      </div>
      <fieldset
        disabled={!canEdit || saving}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
          <Field label="Low below (%)" htmlFor="tank-low-below" error={errors.lowBelowPct?.message}>
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '12px',
          }}
        >
          <Button type="submit" variant="primary" size="sm" disabled={!isDirty || saving}>
            Save tank levels
          </Button>
        </div>
      ) : (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Only an Owner or Manager can change tank levels.
        </p>
      )}
    </Form>
  );
};
