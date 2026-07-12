import React from 'react';
import { OnboardingDraft } from '@pump/shared';
import { Chip, Button } from '../../../pump-ds/index.js';
import { OnboardingValidationIssue } from '../onboardingDraft.js';

interface Step8ReviewProps {
  draft: OnboardingDraft;
  validationIssues: OnboardingValidationIssue[];
  moveToStep: (stepNum: number) => void;
  panelStyle: React.CSSProperties;
  fieldLabelStyle: React.CSSProperties;
}

export const Step8Review: React.FC<Step8ReviewProps> = ({
  draft,
  validationIssues,
  moveToStep,
  panelStyle,
  fieldLabelStyle,
}) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.9fr', gap: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Review & Provision</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Review the full setup, resolve any issues, then provision the entire station in one shot.
              </p>
            </div>
            <Chip tone={validationIssues.length === 0 ? 'success' : 'warning'} size="sm">
              {validationIssues.length === 0 ? 'Ready' : `${validationIssues.length} Issues`}
            </Chip>
          </div>

          {validationIssues.length > 0 ? (
            <div style={{
              backgroundColor: 'var(--state-warning-bg)',
              color: 'var(--state-warning-fg)',
              borderRadius: 'var(--radius-card)',
              padding: '12px 14px',
              border: '1px solid rgba(138, 97, 22, 0.15)',
              fontSize: '12px',
            }}>
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>Resolve these before provisioning:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {validationIssues.map((issue, idx) => (
                  <button
                    key={`${issue.message}-${idx}`}
                    type="button"
                    onClick={() => moveToStep(issue.step)}
                    style={{
                      border: 'none',
                      backgroundColor: 'transparent',
                      padding: 0,
                      textAlign: 'left',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textDecoration: 'underline'
                    }}
                  >
                    Step {issue.step}: {issue.message}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: 'var(--state-success-bg)',
              color: 'var(--state-success-fg)',
              borderRadius: 'var(--radius-card)',
              padding: '12px 14px',
              border: '1px solid rgba(30, 106, 78, 0.15)',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              All required onboarding sections are provision-ready.
            </div>
          )}
        </div>

        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Station & Rules</h3>
            <Button type="button" variant="secondary" size="xs" onClick={() => moveToStep(1)}>Edit</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <div style={fieldLabelStyle}>Station</div>
              <div style={{ marginTop: '4px', fontWeight: 600, color: 'var(--text-strong)' }}>{draft.station.name || '—'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{draft.station.code || 'No code yet'}</div>
            </div>
            <div>
              <div style={fieldLabelStyle}>Business Day Starts</div>
              <div style={{ marginTop: '4px', fontWeight: 600, color: 'var(--text-strong)' }}>{draft.businessRules.businessDayStartsAt}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{draft.station.timezone}</div>
            </div>
          </div>
        </div>

        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Infrastructure & Values</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button type="button" variant="secondary" size="xs" onClick={() => moveToStep(3)}>Fuels</Button>
              <Button type="button" variant="secondary" size="xs" onClick={() => moveToStep(4)}>Tanks</Button>
              <Button type="button" variant="secondary" size="xs" onClick={() => moveToStep(5)}>Dispensers</Button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
            <div style={{ backgroundColor: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-card)', padding: '12px' }}>
              <div style={fieldLabelStyle}>Fuels</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>{draft.products.length}</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-card)', padding: '12px' }}>
              <div style={fieldLabelStyle}>Tanks</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>{draft.tanks.length}</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-card)', padding: '12px' }}>
              <div style={fieldLabelStyle}>Dispensers</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>{draft.dispensers.length}</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-card)', padding: '12px' }}>
              <div style={fieldLabelStyle}>Nozzles</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>{draft.nozzles.length}</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-card)', padding: '12px' }}>
              <div style={fieldLabelStyle}>Payment Terminals</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>{(draft.paymentTerminals ?? []).length}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={panelStyle}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Opening Values Snapshot</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Fuel rates</span>
              <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                {draft.products.filter((product) => product.currentPrice > 0).length} / {draft.products.length}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Opening stock seeded</span>
              <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                {draft.tanks.reduce((sum, tank) => sum + tank.openingQuantity, 0).toLocaleString('en-IN')} L
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Nozzle readings ready</span>
              <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                {draft.nozzles.filter((nozzle) => nozzle.openingReading >= 0).length} / {draft.nozzles.length}
              </span>
            </div>
          </div>
        </div>

        <div style={panelStyle}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Shift Templates</h3>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {draft.shiftTemplates.length > 0
              ? `${draft.shiftTemplates.length} template(s) will be created.`
              : 'No templates will be created during onboarding.'}
          </div>
          <Button type="button" variant="secondary" size="xs" onClick={() => moveToStep(7)}>
            Edit Shift Templates
          </Button>
        </div>
      </div>
    </div>
  );
};
