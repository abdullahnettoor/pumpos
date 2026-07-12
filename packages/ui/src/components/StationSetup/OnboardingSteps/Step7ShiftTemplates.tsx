import React from 'react';
import { OnboardingDraft, OnboardingShiftTemplateDraft } from '@pump/shared';
import { Button } from '../../../pump-ds/index.js';

interface Step7ShiftTemplatesProps {
  draft: OnboardingDraft;
  onAutofillShifts: (count: 2 | 3) => void;
  onAddShiftTemplate: () => void;
  onEditShiftTemplate: (template: OnboardingShiftTemplateDraft) => void;
  onRemoveShiftTemplate: (draftId: string) => void;
  panelStyle: React.CSSProperties;
}

export const Step7ShiftTemplates: React.FC<Step7ShiftTemplatesProps> = ({
  draft,
  onAutofillShifts,
  onAddShiftTemplate,
  onEditShiftTemplate,
  onRemoveShiftTemplate,
  panelStyle,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{
        ...panelStyle,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Shift Templates</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Optional now, but useful if you want the first shift to open against a known operational pattern.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onAutofillShifts(2)}
          >
            Autofill 2 Shifts
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onAutofillShifts(3)}
          >
            Autofill 3 Shifts
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={onAddShiftTemplate}>
            Add Shift Template
          </Button>
        </div>
      </div>

      {draft.shiftTemplates.length === 0 ? (
        <div style={{
          ...panelStyle,
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px'
        }}>
          No shift templates configured. You can still finish onboarding and add them later.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {draft.shiftTemplates.map((template) => (
            <div
              key={template.draftId}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-card)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h4 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-strong)' }}>{template.name || 'Untitled shift'}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hours</span>
                  <span style={{ fontSize: '14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-strong)' }}>
                    {template.startTime} - {template.endTime}
                  </span>
                </div>
              </div>
              <div style={{
                display: 'flex',
                gap: '8px',
                borderTop: '1px solid var(--border-soft)',
                paddingTop: '10px',
                marginTop: '4px',
                justifyContent: 'flex-end'
              }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => onEditShiftTemplate(template)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="xs"
                  onClick={() => onRemoveShiftTemplate(template.draftId)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
