import React from 'react';
import { OnboardingDraft, OnboardingTankDraft } from '@pump/shared';
import { StatusBadge } from '../../StatusBadge.js';

interface Step4TanksProps {
  draft: OnboardingDraft;
  handleQuickAddTank: (productDraftId: string, productName: string, capacity: number) => void;
  onAddTank: () => void;
  onEditTank: (tank: OnboardingTankDraft) => void;
  onRemoveTank: (draftId: string) => void;
  panelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}

export const Step4Tanks: React.FC<Step4TanksProps> = ({
  draft,
  handleQuickAddTank,
  onAddTank,
  onEditTank,
  onRemoveTank,
  panelStyle,
  inputStyle,
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
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Storage Tanks</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Map each tank to its fuel and define its capacity.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onAddTank}
        >
          Add Tank
        </button>
      </div>

      {draft.products.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-alt)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border-soft)'
        }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Quick Add Tanks:</span>
          {draft.products.map((product) => {
            const inputId = `quick-tank-cap-${product.draftId}`;
            return (
              <div key={product.draftId} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-strong)' }}>{product.name}</span>
                <input
                  type="number" min="0"
                  placeholder="Capacity (L)"
                  defaultValue={20000}
                  style={{ ...inputStyle, width: '110px', height: '28px', fontSize: '12px' }}
                  id={inputId}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ height: '28px', padding: '0 10px', fontSize: '11px' }}
                  onClick={() => {
                    const input = document.getElementById(inputId) as HTMLInputElement;
                    const cap = Number(input?.value) || 20000;
                    handleQuickAddTank(product.draftId, product.name, cap);
                  }}
                >
                  Add
                </button>
              </div>
            );
          })}
        </div>
      )}

      {draft.tanks.length === 0 ? (
        <div style={{
          ...panelStyle,
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px'
        }}>
          No storage tanks configured yet. Use the Quick Add banner or click "Add Tank".
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {draft.tanks.map((tank) => {
            const product = draft.products.find((p) => p.draftId === tank.productDraftId);
            return (
              <div
                key={tank.draftId}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: '14px' }}>{tank.name}</span>
                  <div style={{ alignSelf: 'flex-start' }}>
                    <StatusBadge status={product?.name || 'Unmapped'} type="info" />
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capacity</span>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                    {tank.capacity.toLocaleString('en-IN')} L
                  </p>
                </div>
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
                    onClick={() => onEditTank(tank)}
                    style={{ height: '24px', padding: '0 8px', fontSize: '11px' }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onRemoveTank(tank.draftId)}
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
