import React from 'react';
import { Field, TextInput } from '../../primitives/Field.js';
import { KV } from './StepSection.js';
import { grid, type StepProps } from './stepShared.js';

export const UnloadingStep: React.FC<StepProps> = ({ form }) => (
  <div style={grid('1fr 1fr')}>
    <Field label="Unloading started">
      <TextInput type="time" aria-label="Unloading started" {...form.register('unloadStart')} />
    </Field>
    <Field label="Unloading ended">
      <TextInput type="time" aria-label="Unloading ended" {...form.register('unloadEnd')} />
    </Field>
  </div>
);

export const UnloadingSummary: React.FC<StepProps> = ({ values }) => (
  <KV
    items={[
      ['Start', values.unloadStart || '—'],
      ['End', values.unloadEnd || '—'],
    ]}
  />
);
