import React from 'react';
import { OnboardingDraft, OnboardingProductDraft } from '@pump/shared';
import { Chip, Button, EmptyState, Icon, SectionHeader } from '../../../pump-ds/index.js';
import { OnboardingStep } from './stepLayout.js';

interface Step3FuelsCatalogProps {
  draft: OnboardingDraft;
  hasQuickMs: boolean;
  hasQuickHsd: boolean;
  handleQuickFuel: (type: 'MS' | 'HSD') => void;
  onAddProduct: () => void;
  onEditProduct: (product: OnboardingProductDraft) => void;
  onRemoveProduct: (draftId: string) => void;
}

export const Step3FuelsCatalog: React.FC<Step3FuelsCatalogProps> = ({
  draft,
  hasQuickMs,
  hasQuickHsd,
  handleQuickFuel,
  onAddProduct,
  onEditProduct,
  onRemoveProduct,
}) => {
  return (
    <OnboardingStep
      title="Fuels & Rates"
      subtitle="Configure the fuel products sold at this station and their current selling rates."
      actions={
        <>
          {!hasQuickMs && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="plus" size="xs" />}
              onClick={() => handleQuickFuel('MS')}
            >
              Petrol (MS)
            </Button>
          )}
          {!hasQuickHsd && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="plus" size="xs" />}
              onClick={() => handleQuickFuel('HSD')}
            >
              Diesel (HSD)
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={onAddProduct}>
            Add Fuel
          </Button>
        </>
      }
    >
      <section className="flex flex-col gap-2">
        <SectionHeader title="Fuels" subtitle={draft.products.length || undefined} />
        {draft.products.length === 0 ? (
          <EmptyState
            title="No fuel products added yet"
            description='Click "Petrol (MS)" or "Add Fuel" to begin.'
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {draft.products.map((product) => (
              <div
                key={product.draftId}
                className="flex flex-col justify-between gap-3 rounded-card border border-border-soft bg-surface p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-[14px] font-semibold text-ink-strong">
                      {product.name || 'Untitled fuel'}
                    </h4>
                    <span className="font-mono text-[12px] text-ink-muted">
                      {product.code || '—'}
                    </span>
                  </div>
                  <Chip tone="neutral" size="md">
                    {product.taxCategory === 'FUEL_VAT' ? 'Fuel VAT' : product.taxCategory}
                  </Chip>
                </div>

                <div className="mt-1 flex items-center justify-between border-t border-border-soft pt-2.5">
                  <span className="text-[12px] text-ink-muted">
                    Unit: <strong className="text-ink-strong">{product.unit}</strong>
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => onEditProduct(product)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      onClick={() => onRemoveProduct(product.draftId)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </OnboardingStep>
  );
};
