import React from 'react';
import { OnboardingDraft } from '@pump/shared';

interface Step1StationBasicsProps {
  draft: OnboardingDraft;
  updateDraft: (updater: (prev: OnboardingDraft) => OnboardingDraft) => void;
  panelStyle: React.CSSProperties;
  fieldLabelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  textAreaStyle: React.CSSProperties;
}

export const Step1StationBasics: React.FC<Step1StationBasicsProps> = ({
  draft,
  updateDraft,
  panelStyle,
  fieldLabelStyle,
  inputStyle,
  textAreaStyle,
}) => {
  return (
    <div style={{ ...panelStyle, gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Station Basics</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Capture the core station identity once, then finish all provisioning in one smooth submit.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={fieldLabelStyle}>Station Name *</label>
          <input
            type="text"
            value={draft.station.name}
            onChange={(e) => updateDraft((prev) => ({ ...prev, station: { ...prev.station, name: e.target.value } }))}
            style={inputStyle}
            placeholder="e.g. Shell Gachibowli"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={fieldLabelStyle}>Station Code *</label>
          <input
            type="text"
            value={draft.station.code}
            onChange={(e) => updateDraft((prev) => ({ ...prev, station: { ...prev.station, code: e.target.value.toUpperCase() } }))}
            style={inputStyle}
            placeholder="e.g. SH-HYD-01"
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={fieldLabelStyle}>Station Address</label>
        <textarea
          value={draft.station.address || ''}
          onChange={(e) => updateDraft((prev) => ({ ...prev, station: { ...prev.station, address: e.target.value } }))}
          style={textAreaStyle}
          placeholder="Address or landmark"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={fieldLabelStyle}>Contact Phone</label>
          <input
            type="text"
            value={draft.station.phone || ''}
            onChange={(e) => updateDraft((prev) => ({ ...prev, station: { ...prev.station, phone: e.target.value } }))}
            style={inputStyle}
            placeholder="+91 9876543210"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={fieldLabelStyle}>Shift Grace Period (Minutes)</label>
          <input
            type="number"
            min={0}
            value={draft.station.shiftGraceMinutes}
            onChange={(e) => updateDraft((prev) => ({
              ...prev,
              station: { ...prev.station, shiftGraceMinutes: Number(e.target.value) || 0 },
            }))}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
};
