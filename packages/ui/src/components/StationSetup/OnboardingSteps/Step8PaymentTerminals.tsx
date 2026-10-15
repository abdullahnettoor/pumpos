import React from 'react';
import { OnboardingDraft, OnboardingPaymentTerminalDraft } from '@pump/shared';
import { createPaymentTerminalDraft } from '../onboardingDraft.js';
import { Checkbox } from '../../primitives/Toggle.js';
import { ProviderField } from '../../primitives/ProviderField.js';
import { Button, EmptyState, SectionHeader } from '../../../pump-ds/index.js';
import { Field, NumberInput, TextInput } from '../../primitives/Field.js';
import { OnboardingStep, STEP_PANEL } from './stepLayout.js';

interface Step8PaymentTerminalsProps {
  draft: OnboardingDraft;
  updateDraft: (updater: (prev: OnboardingDraft) => OnboardingDraft) => void;
}

export const Step8PaymentTerminals: React.FC<Step8PaymentTerminalsProps> = ({
  draft,
  updateDraft,
}) => {
  const terminals = draft.paymentTerminals ?? [];
  const [quickProvider, setQuickProvider] = React.useState('');
  const [quickCount, setQuickCount] = React.useState(2);

  const addTerminal = () => {
    const next = createPaymentTerminalDraft();
    next.label = `Terminal ${terminals.length + 1}`;
    updateDraft((prev) => ({
      ...prev,
      paymentTerminals: [...(prev.paymentTerminals ?? []), next],
    }));
  };

  // Bulk-create several machines from the same provider in one go — labelled
  // "<Provider> POS <n>", continuing the numbering if that provider already has
  // terminals. Common for stations with a bank of identical acquirer devices.
  const quickAdd = () => {
    const provider = quickProvider.trim();
    const count = Math.max(1, Math.min(50, Math.floor(quickCount) || 1));
    updateDraft((prev) => {
      const existing = prev.paymentTerminals ?? [];
      const sameProviderCount = existing.filter(
        (t) => (t.provider || '').trim().toLowerCase() === provider.toLowerCase(),
      ).length;
      const additions: OnboardingPaymentTerminalDraft[] = [];
      for (let i = 0; i < count; i++) {
        const n = sameProviderCount + i + 1;
        const draftTerminal = createPaymentTerminalDraft();
        draftTerminal.provider = provider;
        draftTerminal.label = provider
          ? `${provider} POS ${n}`
          : `Terminal ${existing.length + i + 1}`;
        additions.push(draftTerminal);
      }
      return { ...prev, paymentTerminals: [...existing, ...additions] };
    });
  };

  const updateTerminal = (draftId: string, patch: Partial<OnboardingPaymentTerminalDraft>) => {
    updateDraft((prev) => ({
      ...prev,
      paymentTerminals: (prev.paymentTerminals ?? []).map((t) =>
        t.draftId === draftId ? { ...t, ...patch } : t,
      ),
    }));
  };

  const removeTerminal = (draftId: string) => {
    updateDraft((prev) => ({
      ...prev,
      paymentTerminals: (prev.paymentTerminals ?? []).filter((t) => t.draftId !== draftId),
    }));
  };

  const quickN = Math.max(1, Math.min(50, Math.floor(quickCount) || 1));

  return (
    <OnboardingStep
      title="Payment Terminals"
      subtitle="Add the card/UPI machines (POS devices) at this station. These are linked to dispensers when a shift is opened. Optional — you can run cash-only and add terminals later from Station → Payment terminals."
      actions={
        <Button type="button" variant="secondary" size="sm" onClick={addTerminal}>
          Add Terminal
        </Button>
      }
    >
      {/* Quick fill: create N identical machines from one provider at once. */}
      <section className="flex flex-col gap-2">
        <SectionHeader title="Quick add" />
        <div className={STEP_PANEL}>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Provider / Acquirer" className="min-w-[220px] flex-1">
              <ProviderField value={quickProvider} onChange={setQuickProvider} />
            </Field>
            <Field label="No. of machines" htmlFor="onb-quick-count" className="w-[120px]">
              <NumberInput
                id="onb-quick-count"
                min={1}
                max={50}
                value={quickCount}
                onChange={(e) => setQuickCount(Number(e.target.value))}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={quickAdd}
              disabled={!quickProvider.trim() || quickCount < 1}
              className="mb-4"
            >
              Add {quickN} machine
              {quickN > 1 ? 's' : ''}
            </Button>
          </div>
          <span className="text-[12px] text-ink-faint">
            Creates machines labelled "{quickProvider.trim() || 'Provider'} POS 1", "…POS 2" — you
            can rename or set each TID below.
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Terminals" subtitle={terminals.length || undefined} />
        {terminals.length === 0 ? (
          <EmptyState
            title="No payment terminals configured"
            description="You can still finish onboarding and add them later."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {terminals.map((terminal, idx) => (
              <div key={terminal.draftId} className={STEP_PANEL}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                    Terminal {idx + 1}
                  </span>
                  <Button
                    type="button"
                    variant="danger"
                    size="xs"
                    onClick={() => removeTerminal(terminal.draftId)}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Label" htmlFor={`onb-term-label-${terminal.draftId}`} required>
                    <TextInput
                      id={`onb-term-label-${terminal.draftId}`}
                      value={terminal.label}
                      onChange={(e) => updateTerminal(terminal.draftId, { label: e.target.value })}
                      placeholder="e.g. Counter HDFC POS"
                    />
                  </Field>
                  <Field label="Provider / Acquirer">
                    <ProviderField
                      key={terminal.draftId}
                      value={terminal.provider}
                      onChange={(v) => updateTerminal(terminal.draftId, { provider: v })}
                    />
                  </Field>
                  <Field label="Terminal ID (TID)" htmlFor={`onb-term-tid-${terminal.draftId}`}>
                    <TextInput
                      id={`onb-term-tid-${terminal.draftId}`}
                      value={terminal.terminalCode}
                      onChange={(e) =>
                        updateTerminal(terminal.draftId, { terminalCode: e.target.value })
                      }
                      placeholder="Device TID"
                    />
                  </Field>
                </div>

                <div className="flex items-center gap-5">
                  <Checkbox
                    label="Accepts Card"
                    checked={terminal.supportsCard}
                    onChange={(e) =>
                      updateTerminal(terminal.draftId, { supportsCard: e.target.checked })
                    }
                  />
                  <Checkbox
                    label="Accepts UPI"
                    checked={terminal.supportsUpi}
                    onChange={(e) =>
                      updateTerminal(terminal.draftId, { supportsUpi: e.target.checked })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </OnboardingStep>
  );
};
