import React from 'react';
import { OnboardingDraft, OnboardingProductDraft } from '@pump/shared';
import { Chip, Button } from '../../../pump-ds/index.js';

interface Step3FuelsCatalogProps {
  draft: OnboardingDraft;
  hasQuickMs: boolean;
  hasQuickHsd: boolean;
  handleQuickFuel: (type: 'MS' | 'HSD') => void;
  onAddProduct: () => void;
  onEditProduct: (product: OnboardingProductDraft) => void;
  onRemoveProduct: (draftId: string) => void;
  panelStyle: React.CSSProperties;
}

export const Step3FuelsCatalog: React.FC<Step3FuelsCatalogProps> = ({
  draft,
  hasQuickMs,
  hasQuickHsd,
  handleQuickFuel,
  onAddProduct,
  onEditProduct,
  onRemoveProduct,
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
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Fuels & Rates</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Configure the fuel products sold at this station and their current selling rates.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!hasQuickMs && (
            <Button type="button" variant="secondary" size="sm" onClick={() => handleQuickFuel('MS')}>
              + Petrol (MS)
            </Button>
          )}
          {!hasQuickHsd && (
            <Button type="button" variant="secondary" size="sm" onClick={() => handleQuickFuel('HSD')}>
              + Diesel (HSD)
            </Button>
          )}
          <Button type="button" variant="primary" size="sm" onClick={onAddProduct}>
            Add Fuel
          </Button>
        </div>
      </div>

      {draft.products.length === 0 ? (
        <div style={{
          ...panelStyle,
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px'
        }}>
          No fuel products added yet. Click "+ Petrol (MS)" or "Add Fuel" to begin.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {draft.products.map((product) => (
            <div
              key={product.draftId}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-strong)' }}>
                    {product.name || 'Untitled fuel'}
                  </h4>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {product.code || '—'}
                  </span>
                </div>
                <Chip tone="info" size="sm">Non-GST</Chip>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border-soft)',
                paddingTop: '10px',
                marginTop: '4px'
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Unit: <strong style={{ color: 'var(--text-strong)' }}>{product.unit}</strong>
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button type="button" variant="secondary" size="xs" onClick={() => onEditProduct(product)}>
                    Edit
                  </Button>
                  <Button type="button" variant="danger" size="xs" onClick={() => onRemoveProduct(product.draftId)}>
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
