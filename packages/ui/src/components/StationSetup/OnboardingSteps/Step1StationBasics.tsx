import React from 'react';
import { OnboardingDraft } from '@pump/shared';
import { Field, NumberInput, Textarea, TextInput } from '../../primitives/Field.js';
import { OnboardingStep, STEP_PANEL } from './stepLayout.js';

interface Step1StationBasicsProps {
  draft: OnboardingDraft;
  updateDraft: (updater: (prev: OnboardingDraft) => OnboardingDraft) => void;
}

export const Step1StationBasics: React.FC<Step1StationBasicsProps> = ({ draft, updateDraft }) => {
  const setStation = (patch: Partial<OnboardingDraft['station']>) =>
    updateDraft((prev) => ({ ...prev, station: { ...prev.station, ...patch } }));

  return (
    <OnboardingStep
      title="Station Basics"
      subtitle="Capture the core station identity once, then finish all provisioning in one smooth submit."
    >
      <div className={STEP_PANEL}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Station Name" htmlFor="onb-station-name" required>
            <TextInput
              id="onb-station-name"
              value={draft.station.name}
              onChange={(e) => setStation({ name: e.target.value })}
              placeholder="e.g. Shell Gachibowli"
            />
          </Field>
          <Field label="Station Code" htmlFor="onb-station-code" required>
            <TextInput
              id="onb-station-code"
              value={draft.station.code}
              onChange={(e) => setStation({ code: e.target.value.toUpperCase() })}
              placeholder="e.g. SH-HYD-01"
            />
          </Field>
        </div>

        <Field label="Station Address" htmlFor="onb-station-address">
          <Textarea
            id="onb-station-address"
            value={draft.station.address || ''}
            onChange={(e) => setStation({ address: e.target.value })}
            placeholder="Address or landmark"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact Phone" htmlFor="onb-station-phone">
            <TextInput
              id="onb-station-phone"
              value={draft.station.phone || ''}
              onChange={(e) => setStation({ phone: e.target.value })}
              placeholder="+91 9876543210"
            />
          </Field>
          <Field label="Shift Grace Period (Minutes)" htmlFor="onb-station-grace">
            <NumberInput
              id="onb-station-grace"
              value={draft.station.shiftGraceMinutes}
              onChange={(e) => setStation({ shiftGraceMinutes: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>
      </div>
    </OnboardingStep>
  );
};
