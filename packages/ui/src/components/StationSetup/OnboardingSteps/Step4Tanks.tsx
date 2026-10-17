import React from 'react';
import { OnboardingDraft, OnboardingTankDraft } from '@pump/shared';
import { Chip, Button, EmptyState, SectionHeader } from '../../../pump-ds/index.js';
import { NumberInput } from '../../primitives/Field.js';
import { formatQuantity } from '../../../utils/format.js';
import { OnboardingStep } from './stepLayout.js';

interface Step4TanksProps {
  draft: OnboardingDraft;
  handleQuickAddTank: (productDraftId: string, productName: string, capacity: number) => void;
  onAddTank: () => void;
  onEditTank: (tank: OnboardingTankDraft) => void;
  onRemoveTank: (draftId: string) => void;
}

export const Step4Tanks: React.FC<Step4TanksProps> = ({
  draft,
  handleQuickAddTank,
  onAddTank,
  onEditTank,
  onRemoveTank,
}) => {
  return (
    <OnboardingStep
      title="Storage tanks"
      subtitle="Map each tank to its fuel and define its capacity."
      actions={
        <Button type="button" variant="secondary" size="sm" onClick={onAddTank}>
          Add tank
        </Button>
      }
    >
      {draft.products.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Quick add tanks" />
          <div className="flex flex-wrap items-center gap-4 rounded-card border border-border-soft bg-surface-alt px-4 py-3">
            {draft.products.map((product) => {
              const inputId = `quick-tank-cap-${product.draftId}`;
              return (
                <div key={product.draftId} className="flex items-center gap-2">
                  <label htmlFor={inputId} className="text-[12px] font-medium text-ink-strong">
                    {product.name}
                  </label>
                  <NumberInput
                    placeholder={`Capacity (${product.unit || 'L'})`}
                    defaultValue={20000}
                    className="h-7 w-[110px] text-[12px]"
                    id={inputId}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const input = document.getElementById(inputId) as HTMLInputElement;
                      const cap = Number(input?.value) || 20000;
                      handleQuickAddTank(product.draftId, product.name, cap);
                    }}
                  >
                    Add
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader title="Tanks" subtitle={draft.tanks.length || undefined} />
        {draft.tanks.length === 0 ? (
          <EmptyState
            title="No storage tanks configured yet"
            description='Use quick add above or click "Add tank".'
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {draft.tanks.map((tank) => {
              const product = draft.products.find((p) => p.draftId === tank.productDraftId);
              return (
                <div
                  key={tank.draftId}
                  className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-[18px]"
                >
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[14px] font-semibold text-ink-strong">{tank.name}</span>
                    <div className="self-start">
                      <Chip tone="neutral" size="md">
                        {product?.name || 'Unmapped'}
                      </Chip>
                    </div>
                  </div>
                  <div>
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                      Capacity
                    </span>
                    <p className="mt-0.5 font-mono text-[18px] font-semibold text-ink-strong">
                      {formatQuantity(tank.capacity, product?.unit || 'L', { decimals: 0 })}
                    </p>
                  </div>
                  <div className="mt-1 flex justify-end gap-2 border-t border-border-soft pt-2.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => onEditTank(tank)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      onClick={() => onRemoveTank(tank.draftId)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </OnboardingStep>
  );
};
