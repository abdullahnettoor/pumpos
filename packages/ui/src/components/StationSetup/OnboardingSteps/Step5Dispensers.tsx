import React from 'react';
import { OnboardingDraft, OnboardingDispenserDraft } from '@pump/shared';

interface Step5DispensersProps {
  draft: OnboardingDraft;
  onAddDualDispenser: () => void;
  onAddQuadDispenser: () => void;
  onAddCustomDispenser: () => void;
  onManageDispenser: (dispenser: OnboardingDispenserDraft) => void;
  onRemoveDispenser: (draftId: string) => void;
  panelStyle: React.CSSProperties;
}

export const Step5Dispensers: React.FC<Step5DispensersProps> = ({
  draft,
  onAddDualDispenser,
  onAddQuadDispenser,
  onAddCustomDispenser,
  onManageDispenser,
  onRemoveDispenser,
  panelStyle,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{
        ...panelStyle,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Dispensers & Nozzles</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Map dispensers to your layout. Each nozzle connects to a specific storage tank and product.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAddDualDispenser}>
            + Add Dual (2 Nozzles)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAddQuadDispenser}>
            + Add Quad (4 Nozzles)
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onAddCustomDispenser}>
            Add Custom
          </button>
        </div>
      </div>

      {draft.dispensers.length === 0 ? (
        <div style={{
          ...panelStyle,
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px'
        }}>
          No dispensers configured yet. Click "+ Add Dual", "+ Add Quad", or "Add Custom" to begin.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {draft.dispensers.map((du) => {
            const duNozzles = draft.nozzles.filter((n) => n.dispenserDraftId === du.draftId);
            return (
              <div
                key={du.draftId}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  padding: '18px',
                  borderRadius: 'var(--radius-card)',
                  border: '1px solid var(--border-soft)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.01)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-strong)' }}>{du.name}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: du.status === 'ACTIVE' ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
                      color: du.status === 'ACTIVE' ? 'var(--state-success-fg)' : 'var(--state-danger-fg)',
                    }}
                  >
                    {du.status}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ISLAND CODE</span>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginTop: '2px' }}>
                    {du.code}
                  </p>
                </div>

                {/* Nozzles Sub-list */}
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', marginTop: '4px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nozzles</span>
                  {duNozzles.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      {duNozzles.map((n) => {
                        const prod = draft.products.find((p) => p.draftId === n.productDraftId);
                        const tank = draft.tanks.find((t) => t.draftId === n.tankDraftId);
                        return (
                          <div key={n.draftId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-default)' }}>
                            <span style={{ fontWeight: 500 }}>
                              {n.name} → <span style={{ color: 'var(--text-muted)' }}>{tank?.name || 'No Tank'} ({prod?.name || 'No Fuel'})</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      No nozzles connected to this dispenser.
                    </p>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  borderTop: '1px solid var(--border-soft)',
                  paddingTop: '10px',
                  marginTop: '4px',
                  justifyContent: 'flex-end'
                }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onManageDispenser(du)}
                    style={{ height: '24px', padding: '0 8px', fontSize: '11px' }}
                  >
                    Manage Nozzles
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onRemoveDispenser(du.draftId)}
                    style={{ height: '24px', padding: '0 8px', fontSize: '11px', color: 'var(--state-danger-fg)' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
