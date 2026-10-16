import React from 'react';
import { OnboardingDraft } from '@pump/shared';
import { SectionHeader } from '../../../pump-ds/index.js';
import { Field, MoneyInput, NumberInput } from '../../primitives/Field.js';
import { formatQuantity } from '../../../utils/format.js';
import { OnboardingStep } from './stepLayout.js';

const CARD = 'flex flex-col gap-2 rounded-card border border-border-soft bg-surface-alt p-3.5';

interface Step6OpeningValuesProps {
  draft: OnboardingDraft;
  updateDraft: (updater: (prev: OnboardingDraft) => OnboardingDraft) => void;
}

export const Step6OpeningValues: React.FC<Step6OpeningValuesProps> = ({ draft, updateDraft }) => {
  const handlePriceChange = (productDraftId: string, val: number) => {
    updateDraft((prev) => ({
      ...prev,
      products: prev.products.map((item) =>
        item.draftId === productDraftId ? { ...item, currentPrice: val } : item,
      ),
    }));
  };

  const handleTankStockChange = (tankDraftId: string, val: number) => {
    updateDraft((prev) => ({
      ...prev,
      tanks: prev.tanks.map((item) =>
        item.draftId === tankDraftId ? { ...item, openingQuantity: val } : item,
      ),
    }));
  };

  const handleTankCostChange = (tankDraftId: string, val: number) => {
    updateDraft((prev) => ({
      ...prev,
      tanks: prev.tanks.map((item) =>
        item.draftId === tankDraftId ? { ...item, openingCostRate: val } : item,
      ),
    }));
  };

  return (
    <OnboardingStep
      title="Opening / current values"
      subtitle="Finalize current rates and opening tank stock before provisioning the station. Nozzle opening readings are captured when you open the first operational shift."
    >
      <section className="flex flex-col gap-2">
        <SectionHeader title="Current fuel selling rates" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {draft.products.map((product) => {
            const id = `onb-price-${product.draftId}`;
            return (
              <div key={product.draftId} className={CARD}>
                <Field label={`${product.name} (${product.code})`} htmlFor={id}>
                  <MoneyInput
                    id={id}
                    step="0.01"
                    placeholder="0.00"
                    value={product.currentPrice || ''}
                    onChange={(e) => handlePriceChange(product.draftId, Number(e.target.value))}
                  />
                </Field>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Tanks opening stock reserves" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {draft.tanks.map((tank) => {
            const product = draft.products.find((p) => p.draftId === tank.productDraftId);
            const unit = product?.unit || 'L';
            return (
              <div key={tank.draftId} className={CARD}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink-strong">{tank.name}</span>
                  <span className="text-[12px] text-ink-muted">{product?.name || 'Unmapped'}</span>
                </div>
                <div className="text-[12px] text-ink-muted">
                  Capacity: {formatQuantity(tank.capacity, unit, { decimals: 0 })}
                </div>
                <Field label={`Opening stock (${unit})`} htmlFor={`onb-stock-${tank.draftId}`}>
                  <NumberInput
                    id={`onb-stock-${tank.draftId}`}
                    max={tank.capacity}
                    step="0.1"
                    placeholder="e.g. 5000"
                    value={tank.openingQuantity || ''}
                    onChange={(e) => handleTankStockChange(tank.draftId, Number(e.target.value))}
                  />
                </Field>
                <Field
                  label={`Purchase rate (₹/${unit}) — landed cost`}
                  htmlFor={`onb-cost-${tank.draftId}`}
                  hint="Seeds cost basis for margin. Leave 0 if unknown."
                >
                  <MoneyInput
                    id={`onb-cost-${tank.draftId}`}
                    step="0.01"
                    placeholder="e.g. 88.50"
                    value={tank.openingCostRate || ''}
                    onChange={(e) => handleTankCostChange(tank.draftId, Number(e.target.value))}
                  />
                </Field>
              </div>
            );
          })}
        </div>
      </section>
    </OnboardingStep>
  );
};
