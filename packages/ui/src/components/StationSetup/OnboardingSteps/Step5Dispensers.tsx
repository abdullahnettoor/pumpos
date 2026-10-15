import React from 'react';
import { OnboardingDraft, OnboardingDispenserDraft } from '@pump/shared';
import { Button, EmptyState, Icon, SectionHeader, StatusChip } from '../../../pump-ds/index.js';
import { OnboardingStep } from './stepLayout.js';

interface Step5DispensersProps {
  draft: OnboardingDraft;
  onAddDualDispenser: () => void;
  onAddQuadDispenser: () => void;
  onAddCustomDispenser: () => void;
  onManageDispenser: (dispenser: OnboardingDispenserDraft) => void;
  onRemoveDispenser: (draftId: string) => void;
}

const fieldCaption = 'text-[12px] font-semibold uppercase tracking-wide text-ink-muted';

export const Step5Dispensers: React.FC<Step5DispensersProps> = ({
  draft,
  onAddDualDispenser,
  onAddQuadDispenser,
  onAddCustomDispenser,
  onManageDispenser,
  onRemoveDispenser,
}) => {
  return (
    <OnboardingStep
      title="Dispensers & Nozzles"
      subtitle="Map dispensers to your layout. Each nozzle connects to a specific storage tank and product."
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<Icon name="plus" size="xs" />}
            onClick={onAddDualDispenser}
          >
            Add Dual (2 Nozzles)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<Icon name="plus" size="xs" />}
            onClick={onAddQuadDispenser}
          >
            Add Quad (4 Nozzles)
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={onAddCustomDispenser}>
            Add Custom
          </Button>
        </>
      }
    >
      <section className="flex flex-col gap-2">
        <SectionHeader title="Dispensers" subtitle={draft.dispensers.length || undefined} />
        {draft.dispensers.length === 0 ? (
          <EmptyState
            title="No dispensers configured yet"
            description='Click "Add Dual", "Add Quad", or "Add Custom" to begin.'
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {draft.dispensers.map((du) => {
              const duNozzles = draft.nozzles.filter((n) => n.dispenserDraftId === du.draftId);
              return (
                <div
                  key={du.draftId}
                  className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-[18px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-ink-strong">{du.name}</span>
                    <StatusChip status={du.status === 'ACTIVE' ? 'active' : 'inactive'} />
                  </div>
                  <div>
                    <span className={fieldCaption}>Island code</span>
                    <p className="mt-0.5 text-[14px] font-semibold text-ink-strong">{du.code}</p>
                  </div>

                  {/* Nozzles Sub-list */}
                  <div className="mt-1 border-t border-border-soft pt-2.5">
                    <span className={fieldCaption}>Nozzles</span>
                    {duNozzles.length > 0 ? (
                      <div className="mt-1.5 flex flex-col gap-1.5">
                        {duNozzles.map((n) => {
                          const prod = draft.products.find((p) => p.draftId === n.productDraftId);
                          const tank = draft.tanks.find((t) => t.draftId === n.tankDraftId);
                          return (
                            <div
                              key={n.draftId}
                              className="flex justify-between text-[12px] text-ink-default"
                            >
                              <span className="font-medium">
                                {n.name} →{' '}
                                <span className="text-ink-muted">
                                  {tank?.name || 'No Tank'} ({prod?.name || 'No Fuel'})
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-1 text-[12px] italic text-ink-muted">
                        No nozzles connected to this dispenser.
                      </p>
                    )}
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-1 flex justify-end gap-2 border-t border-border-soft pt-2.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => onManageDispenser(du)}
                    >
                      Manage Nozzles
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      onClick={() => onRemoveDispenser(du.draftId)}
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
