import React from 'react';
import { OnboardingDraft } from '@pump/shared';

interface Step6OpeningValuesProps {
  draft: OnboardingDraft;
  updateDraft: (updater: (prev: OnboardingDraft) => OnboardingDraft) => void;
  panelStyle: React.CSSProperties;
  fieldLabelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}

export const Step6OpeningValues: React.FC<Step6OpeningValuesProps> = ({
  draft,
  updateDraft,
  panelStyle,
  fieldLabelStyle,
  inputStyle,
}) => {
  const handlePriceChange = (productDraftId: string, val: number) => {
    updateDraft((prev) => ({
      ...prev,
      products: prev.products.map((item) =>
        item.draftId === productDraftId ? { ...item, currentPrice: val } : item
      ),
    }));
  };

  const handleTankStockChange = (tankDraftId: string, val: number) => {
    updateDraft((prev) => ({
      ...prev,
      tanks: prev.tanks.map((item) =>
        item.draftId === tankDraftId ? { ...item, openingQuantity: val } : item
      ),
    }));
  };

  const handleTankCostChange = (tankDraftId: string, val: number) => {
    updateDraft((prev) => ({
      ...prev,
      tanks: prev.tanks.map((item) =>
        item.draftId === tankDraftId ? { ...item, openingCostRate: val } : item
      ),
    }));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
      <div style={panelStyle}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Opening / Current Values</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Finalize current rates and opening tank stock before provisioning the station. Nozzle opening readings are captured when you open the first operational shift.
          </p>
        </div>

        {/* 1. Fuel Prices Catalog */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-soft)', paddingTop: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Current Fuel Selling Rates</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {draft.products.map((product) => (
              <div
                key={product.draftId}
                style={{
                  backgroundColor: 'var(--bg-surface-alt)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-card)',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>
                  {product.name} ({product.code})
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>₹</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={product.currentPrice || ''}
                    onChange={(e) => handlePriceChange(product.draftId, Number(e.target.value))}
                    style={{ ...inputStyle, width: '100%', height: '30px' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Tanks Opening Stocks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-soft)', paddingTop: '16px', marginTop: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Tanks Opening Stock Reserves</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {draft.tanks.map((tank) => {
              const product = draft.products.find((p) => p.draftId === tank.productDraftId);
              return (
                <div
                  key={tank.draftId}
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-card)',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-strong)' }}>{tank.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{product?.name || 'Unmapped'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>Capacity: {tank.capacity.toLocaleString()} {product?.unit || 'L'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Opening Stock ({product?.unit || 'L'})</span>
                    <input
                      type="number"
                      min={0}
                      max={tank.capacity}
                      step="0.1"
                      placeholder="e.g. 5000"
                      value={tank.openingQuantity || ''}
                      onChange={(e) => handleTankStockChange(tank.draftId, Number(e.target.value))}
                      style={{ ...inputStyle, width: '100%', height: '30px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Purchase Rate (₹/{product?.unit || 'L'}) — landed cost</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 88.50"
                      value={tank.openingCostRate || ''}
                      onChange={(e) => handleTankCostChange(tank.draftId, Number(e.target.value))}
                      style={{ ...inputStyle, width: '100%', height: '30px' }}
                    />
                    <span style={{ fontSize: '9px', color: 'var(--text-faint)' }}>Seeds cost basis for margin. Leave 0 if unknown.</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
