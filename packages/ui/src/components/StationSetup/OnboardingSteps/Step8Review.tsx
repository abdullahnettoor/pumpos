import React from 'react';
import { OnboardingDraft } from '@pump/shared';
import { Chip, Button, SectionHeader } from '../../../pump-ds/index.js';
import { formatQuantity } from '../../../utils/format.js';
import { OnboardingValidationIssue } from '../onboardingDraft.js';
import { OnboardingStep, STEP_PANEL } from './stepLayout.js';

interface Step8ReviewProps {
  draft: OnboardingDraft;
  validationIssues: OnboardingValidationIssue[];
  moveToStep: (stepNum: number) => void;
}

const LABEL = 'text-[12px] font-semibold text-ink-muted';

export const Step8Review: React.FC<Step8ReviewProps> = ({
  draft,
  validationIssues,
  moveToStep,
}) => {
  const counts = [
    { label: 'Fuels', value: draft.products.length },
    { label: 'Tanks', value: draft.tanks.length },
    { label: 'Dispensers', value: draft.dispensers.length },
    { label: 'Nozzles', value: draft.nozzles.length },
    { label: 'Payment Terminals', value: (draft.paymentTerminals ?? []).length },
  ];

  const openingStock = (() => {
    const byUnit: Record<string, number> = {};
    for (const tank of draft.tanks) {
      const unit = draft.products.find((p) => p.draftId === tank.productDraftId)?.unit || 'L';
      byUnit[unit] = (byUnit[unit] || 0) + Number(tank.openingQuantity || 0);
    }
    const parts = Object.entries(byUnit).map(([u, v]) => formatQuantity(v, u));
    return parts.length ? parts.join(' · ') : formatQuantity(0, 'L');
  })();

  return (
    <OnboardingStep
      title="Review & Provision"
      subtitle="Review the full setup, resolve any issues, then provision the entire station in one shot."
      actions={
        <Chip tone={validationIssues.length === 0 ? 'success' : 'warning'} size="md">
          {validationIssues.length === 0 ? 'Ready' : `${validationIssues.length} Issues`}
        </Chip>
      }
    >
      <div className="grid grid-cols-[1.35fr_0.9fr] gap-5">
        <div className="flex flex-col gap-5">
          {validationIssues.length > 0 ? (
            <div className="rounded-card border border-warning-fg/15 bg-warning-bg px-3.5 py-3 text-[12px] text-warning-fg">
              <div className="mb-2 font-semibold">Resolve these before provisioning:</div>
              <div className="flex flex-col items-start gap-1.5">
                {validationIssues.map((issue, idx) => (
                  <Button
                    key={`${issue.message}-${idx}`}
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => moveToStep(issue.step)}
                    className="h-auto px-0 text-left text-warning-fg underline hover:bg-transparent"
                  >
                    Step {issue.step}: {issue.message}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-card border border-success-fg/15 bg-success-bg px-3.5 py-3 text-[12px] font-semibold text-success-fg">
              All required onboarding sections are provision-ready.
            </div>
          )}

          <section className="flex flex-col gap-2">
            <SectionHeader
              title="Station & Rules"
              action={{ label: 'Edit', onClick: () => moveToStep(1) }}
            />
            <div className={STEP_PANEL}>
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <div className={LABEL}>Station</div>
                  <div className="mt-1 font-semibold text-ink-strong">
                    {draft.station.name || '—'}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-muted">
                    {draft.station.code || 'No code yet'}
                  </div>
                </div>
                <div>
                  <div className={LABEL}>Business Day Starts</div>
                  <div className="mt-1 font-semibold text-ink-strong">
                    {draft.businessRules.businessDayStartsAt}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-muted">{draft.station.timezone}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeader
              title="Infrastructure & Values"
              controls={{
                actions: (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => moveToStep(3)}
                    >
                      Fuels
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => moveToStep(4)}
                    >
                      Tanks
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => moveToStep(5)}
                    >
                      Dispensers
                    </Button>
                  </>
                ),
              }}
            />
            <div className={STEP_PANEL}>
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-4">
                {counts.map((c) => (
                  <div key={c.label}>
                    <dt className="text-[12px] text-ink-muted">{c.label}</dt>
                    <dd className="mt-1 text-[13px] tabular-nums text-ink-strong">{c.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <SectionHeader title="Opening Values Snapshot" />
            <div className={STEP_PANEL}>
              <div className="flex flex-col gap-2.5 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Fuel rates</span>
                  <span className="font-semibold text-ink-strong">
                    {draft.products.filter((product) => product.currentPrice > 0).length} /{' '}
                    {draft.products.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Opening stock seeded</span>
                  <span className="font-semibold text-ink-strong">{openingStock}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeader title="Shift Templates" />
            <div className={STEP_PANEL}>
              <div className="text-[12px] text-ink-muted">
                {draft.shiftTemplates.length > 0
                  ? `${draft.shiftTemplates.length} template(s) will be created.`
                  : 'No templates will be created during onboarding.'}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                className="self-start"
                onClick={() => moveToStep(7)}
              >
                Edit Shift Templates
              </Button>
            </div>
          </section>
        </div>
      </div>
    </OnboardingStep>
  );
};
