import React from 'react';
import { OnboardingDraft, OnboardingShiftTemplateDraft } from '@pump/shared';
import { Button, EmptyState, SectionHeader } from '../../../pump-ds/index.js';
import { OnboardingStep } from './stepLayout.js';

interface Step7ShiftTemplatesProps {
  draft: OnboardingDraft;
  onAutofillShifts: (count: 2 | 3) => void;
  onAddShiftTemplate: () => void;
  onEditShiftTemplate: (template: OnboardingShiftTemplateDraft) => void;
  onRemoveShiftTemplate: (draftId: string) => void;
}

export const Step7ShiftTemplates: React.FC<Step7ShiftTemplatesProps> = ({
  draft,
  onAutofillShifts,
  onAddShiftTemplate,
  onEditShiftTemplate,
  onRemoveShiftTemplate,
}) => {
  return (
    <OnboardingStep
      title="Shift templates"
      subtitle="Optional now, but useful if you want the first shift to open against a known operational pattern."
      actions={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => onAutofillShifts(2)}>
            Autofill 2 Shifts
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onAutofillShifts(3)}>
            Autofill 3 Shifts
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onAddShiftTemplate}>
            Add shift template
          </Button>
        </>
      }
    >
      <section className="flex flex-col gap-2">
        <SectionHeader title="Templates" subtitle={draft.shiftTemplates.length || undefined} />
        {draft.shiftTemplates.length === 0 ? (
          <EmptyState
            title="No shift templates configured"
            description="You can still finish onboarding and add them later."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {draft.shiftTemplates.map((template) => (
              <div
                key={template.draftId}
                className="flex flex-col justify-between gap-3 rounded-card border border-border-soft bg-surface p-4"
              >
                <div>
                  <h4 className="text-[14px] font-semibold text-ink-strong">
                    {template.name || 'Untitled shift'}
                  </h4>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                      Hours
                    </span>
                    <span className="font-mono text-[14px] font-semibold text-ink-strong">
                      {template.startTime} - {template.endTime}
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex justify-end gap-2 border-t border-border-soft pt-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => onEditShiftTemplate(template)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="xs"
                    onClick={() => onRemoveShiftTemplate(template.draftId)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </OnboardingStep>
  );
};
