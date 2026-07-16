import React from 'react';
import { OnboardingDraft, OperatingDaySchedule } from '@pump/shared';
import { Chip } from '../../../pump-ds/index.js';
import { formatWeekday } from '../onboardingDraft.js';
import { Checkbox } from '../../primitives/Toggle.js';

interface Step2BusinessRulesProps {
  draft: OnboardingDraft;
  updateDraft: (updater: (prev: OnboardingDraft) => OnboardingDraft) => void;
  syncTwentyFourSeven: (enabled: boolean) => void;
  panelStyle: React.CSSProperties;
  fieldLabelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}

export const Step2BusinessRules: React.FC<Step2BusinessRulesProps> = ({
  draft,
  updateDraft,
  syncTwentyFourSeven,
  panelStyle,
  fieldLabelStyle,
  inputStyle,
}) => {
  const handleDayOpenChange = (dayName: OperatingDaySchedule['day'], isOpen: boolean) => {
    updateDraft((prev) => ({
      ...prev,
      businessRules: {
        ...prev.businessRules,
        operatingSchedule: {
          ...prev.businessRules.operatingSchedule,
          days: prev.businessRules.operatingSchedule.days.map((item) =>
            item.day === dayName ? { ...item, isOpen } : item
          ),
        },
      },
    }));
  };

  const handleDayTimeChange = (
    dayName: OperatingDaySchedule['day'],
    field: 'openTime' | 'closeTime',
    val: string
  ) => {
    updateDraft((prev) => ({
      ...prev,
      businessRules: {
        ...prev.businessRules,
        operatingSchedule: {
          ...prev.businessRules.operatingSchedule,
          days: prev.businessRules.operatingSchedule.days.map((item) =>
            item.day === dayName ? { ...item, [field]: val } : item
          ),
        },
      },
    }));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px' }}>
      <div style={panelStyle}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Business Rules</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Define when the station operates and where one business day begins.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={fieldLabelStyle}>Timezone</label>
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-surface-alt)' }}>
              {draft.station.timezone}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={fieldLabelStyle}>Business Day Starts At *</label>
            <input
              type="time"
              value={draft.businessRules.businessDayStartsAt}
              onChange={(e) => updateDraft((prev) => ({
                ...prev,
                businessRules: { ...prev.businessRules, businessDayStartsAt: e.target.value },
              }))}
              style={inputStyle}
            />
          </div>
        </div>

        <Checkbox
          label="This station operates 24 / 7"
          checked={draft.businessRules.operatingSchedule.isTwentyFourSeven}
          onChange={(e) => syncTwentyFourSeven(e.target.checked)}
        />

        <div>
          <span style={{ ...fieldLabelStyle, display: 'block', marginBottom: '8px' }}>Weekly Operating Schedule</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            {draft.businessRules.operatingSchedule.days.map((day) => (
              <div
                key={day.day}
                style={{
                  backgroundColor: 'var(--bg-surface-alt)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-card)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-strong)' }}>
                    {formatWeekday(day.day)}
                  </span>
                  <Checkbox
                    label="Open"
                    checked={day.isOpen}
                    disabled={draft.businessRules.operatingSchedule.isTwentyFourSeven}
                    onChange={(e) => handleDayOpenChange(day.day, e.target.checked)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Open</span>
                    <input
                      type="time"
                      value={day.openTime}
                      disabled={!day.isOpen || draft.businessRules.operatingSchedule.isTwentyFourSeven}
                      onChange={(e) => handleDayTimeChange(day.day, 'openTime', e.target.value)}
                      style={{ ...inputStyle, width: '100%', height: '26px', fontSize: '11px', padding: '0 4px' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Close</span>
                    <input
                      type="time"
                      value={day.closeTime}
                      disabled={!day.isOpen || draft.businessRules.operatingSchedule.isTwentyFourSeven}
                      onChange={(e) => handleDayTimeChange(day.day, 'closeTime', e.target.value)}
                      style={{ ...inputStyle, width: '100%', height: '26px', fontSize: '11px', padding: '0 4px' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={panelStyle}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Policy Summary</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            These rules will drive reporting boundaries and future shift automation.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <span style={fieldLabelStyle}>Business Day</span>
            <div style={{ marginTop: '4px', fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Starts at {draft.businessRules.businessDayStartsAt}
            </div>
          </div>
          <div>
            <span style={fieldLabelStyle}>Operating Mode</span>
            <div style={{ marginTop: '4px' }}>
              <Chip tone={draft.businessRules.operatingSchedule.isTwentyFourSeven ? 'success' : 'info'} size="sm">
                {draft.businessRules.operatingSchedule.isTwentyFourSeven ? '24/7' : 'Scheduled'}
              </Chip>
            </div>
          </div>
          {!draft.businessRules.operatingSchedule.isTwentyFourSeven && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {draft.businessRules.operatingSchedule.days.map((day) => (
                <div key={day.day} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-default)' }}>{formatWeekday(day.day)}</span>
                  <span style={{ color: day.isOpen ? 'var(--text-strong)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {day.isOpen ? `${day.openTime} - ${day.closeTime}` : 'Closed'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
