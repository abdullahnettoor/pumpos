import React from 'react';
import { DEFAULT_TANK_LEVEL_SETTINGS, OnboardingDraft, OperatingDaySchedule } from '@pump/shared';
import { Chip, SectionHeader } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import { Field, TextInput } from '../../primitives/Field.js';
import { OnboardingStep, STEP_PANEL } from './stepLayout.js';
import { formatWeekday } from '../onboardingDraft.js';
import { Checkbox } from '../../primitives/Toggle.js';

interface Step2BusinessRulesProps {
  draft: OnboardingDraft;
  updateDraft: (updater: (prev: OnboardingDraft) => OnboardingDraft) => void;
  syncTwentyFourSeven: (enabled: boolean) => void;
}

export const Step2BusinessRules: React.FC<Step2BusinessRulesProps> = ({
  draft,
  updateDraft,
  syncTwentyFourSeven,
}) => {
  const handleDayOpenChange = (dayName: OperatingDaySchedule['day'], isOpen: boolean) => {
    updateDraft((prev) => ({
      ...prev,
      businessRules: {
        ...prev.businessRules,
        operatingSchedule: {
          ...prev.businessRules.operatingSchedule,
          days: prev.businessRules.operatingSchedule.days.map((item) =>
            item.day === dayName ? { ...item, isOpen } : item,
          ),
        },
      },
    }));
  };

  const handleDayTimeChange = (
    dayName: OperatingDaySchedule['day'],
    field: 'openTime' | 'closeTime',
    val: string,
  ) => {
    updateDraft((prev) => ({
      ...prev,
      businessRules: {
        ...prev.businessRules,
        operatingSchedule: {
          ...prev.businessRules.operatingSchedule,
          days: prev.businessRules.operatingSchedule.days.map((item) =>
            item.day === dayName ? { ...item, [field]: val } : item,
          ),
        },
      },
    }));
  };

  const scheduleLocked = draft.businessRules.operatingSchedule.isTwentyFourSeven;
  const timeControl = (
    day: OperatingDaySchedule,
    field: 'openTime' | 'closeTime',
    label: string,
  ) => (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <TextInput
        type="time"
        aria-label={`${formatWeekday(day.day)} ${label.toLowerCase()}`}
        value={day[field]}
        disabled={!day.isOpen || scheduleLocked}
        onChange={(e) => handleDayTimeChange(day.day, field, e.target.value)}
        className="box-border h-[26px] w-full min-w-0 px-1 text-[12px]"
      />
    </div>
  );

  return (
    <OnboardingStep
      title="Business Rules"
      subtitle="Define when the station operates and where one business day begins."
    >
      <div className="grid grid-cols-[1.3fr_1fr] gap-5">
        <section className={STEP_PANEL}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timezone" htmlFor="onb-timezone">
              <TextInput id="onb-timezone" value={draft.station.timezone} readOnly disabled />
            </Field>
            <Field label="Business Day Starts At" htmlFor="onb-day-start" required>
              <TextInput
                id="onb-day-start"
                type="time"
                value={draft.businessRules.businessDayStartsAt}
                onChange={(e) =>
                  updateDraft((prev) => ({
                    ...prev,
                    businessRules: { ...prev.businessRules, businessDayStartsAt: e.target.value },
                  }))
                }
              />
            </Field>
          </div>

          <Checkbox
            label="This station operates 24 / 7"
            checked={scheduleLocked}
            onChange={(e) => syncTwentyFourSeven(e.target.checked)}
          />

          <section className="flex flex-col gap-2">
            <SectionHeader title="Weekly Operating Schedule" />
            <div
              data-testid="schedule-grid"
              className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3"
            >
              {draft.businessRules.operatingSchedule.days.map((day) => (
                <div
                  key={day.day}
                  className="flex min-w-0 flex-col gap-2 rounded-card border border-border-soft bg-surface-alt p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink-strong">
                      {formatWeekday(day.day)}
                    </span>
                    <Checkbox
                      label="Open"
                      checked={day.isOpen}
                      disabled={scheduleLocked}
                      onChange={(e) => handleDayOpenChange(day.day, e.target.checked)}
                    />
                  </div>
                  <div className="flex gap-2">
                    {timeControl(day, 'openTime', 'Open')}
                    {timeControl(day, 'closeTime', 'Close')}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Policy Summary"
            subtitle="Drives reporting boundaries and shift automation."
          />
          <div className={STEP_PANEL}>
            <div>
              <span className="text-[12px] font-semibold text-ink-muted">Business Day</span>
              <div className="mt-1 text-[14px] font-semibold text-ink-strong">
                Starts at {draft.businessRules.businessDayStartsAt}
              </div>
            </div>
            <div>
              <span className="text-[12px] font-semibold text-ink-muted">Tank Levels</span>
              <div className="mt-1 text-[12px] text-ink-default" data-testid="tank-level-defaults">
                Critical below {DEFAULT_TANK_LEVEL_SETTINGS.criticalBelowPct}% · low below{' '}
                {DEFAULT_TANK_LEVEL_SETTINGS.lowBelowPct}% of capacity
              </div>
              <div className="mt-0.5 text-[12px] text-ink-muted">
                Change later in Station → Rules.
              </div>
            </div>
            <div>
              <span className="text-[12px] font-semibold text-ink-muted">Operating Mode</span>
              <div className="mt-1">
                <Chip tone={scheduleLocked ? 'success' : 'info'} size="md">
                  {scheduleLocked ? '24/7' : 'Scheduled'}
                </Chip>
              </div>
            </div>
            {!scheduleLocked && (
              <div className="flex flex-col gap-1.5">
                {draft.businessRules.operatingSchedule.days.map((day) => (
                  <div key={day.day} className="flex justify-between text-[12px]">
                    <span className="text-ink-default">{formatWeekday(day.day)}</span>
                    <span
                      className={cn('font-mono', day.isOpen ? 'text-ink-strong' : 'text-ink-muted')}
                    >
                      {day.isOpen ? `${day.openTime} - ${day.closeTime}` : 'Closed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </OnboardingStep>
  );
};
