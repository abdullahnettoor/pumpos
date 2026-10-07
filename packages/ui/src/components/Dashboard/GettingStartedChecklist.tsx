import React from 'react';
import { Check, Lock, X } from 'lucide-react';
import { Panel, Button, Chip } from '../../pump-ds/index.js';

/**
 * A single getting-started step. `done` renders a tick; `locked` shows a muted,
 * non-actionable row (e.g. steps that only unlock once the station is live).
 */
export interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  locked?: boolean;
  lockedHint?: string;
  actionLabel: string;
  onAction: () => void;
  /** Optional steps can be deferred. Required steps never show a Skip control. */
  skippable?: boolean;
  skipped?: boolean;
  onSkip?: () => void;
  onUndoSkip?: () => void;
}

/** A step is complete when done, or when the user chose to skip it. */
export const isStepComplete = (step: Pick<ChecklistStep, 'done' | 'skipped'>): boolean =>
  step.done || !!step.skipped;

export interface GettingStartedChecklistProps {
  steps: ChecklistStep[];
  title?: string;
  /** Show a dismiss control (e.g. once the station is operational). */
  dismissible?: boolean;
  onDismiss?: () => void;
}

/**
 * GettingStartedChecklist — a compact, progressive onboarding checklist for the
 * dashboard. Purely presentational: the dashboard computes each step's `done`
 * state from cached data and passes navigation handlers in.
 */
export const GettingStartedChecklist: React.FC<GettingStartedChecklistProps> = ({
  steps,
  title = 'Get started',
  dismissible = false,
  onDismiss,
}) => {
  const doneCount = steps.filter(isStepComplete).length;

  return (
    <Panel
      title={title}
      flush
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Chip tone={doneCount === steps.length ? 'success' : 'neutral'} size="xs">
            {doneCount} of {steps.length} done
          </Chip>
          {dismissible && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss getting started"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-button)',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      }
    >
      <ul className="divide-y divide-border-soft">
        {steps.map((step, i) => (
          <li
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              opacity: (step.locked && !step.done) || step.skipped ? 0.6 : 1,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                flexShrink: 0,
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: isStepComplete(step)
                  ? 'var(--state-success-bg)'
                  : 'var(--bg-surface-alt)',
                color: isStepComplete(step) ? 'var(--state-success-fg)' : 'var(--text-muted)',
                border: isStepComplete(step) ? 'none' : '1px solid var(--border-strong)',
              }}
            >
              {isStepComplete(step) ? (
                <Check size={14} />
              ) : step.locked ? (
                <Lock size={12} />
              ) : (
                i + 1
              )}
            </span>

            <span
              style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-strong)',
                  textDecoration: isStepComplete(step) ? 'line-through' : 'none',
                }}
              >
                {step.label}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {step.locked && !step.done
                  ? (step.lockedHint ?? step.description)
                  : step.description}
              </span>
            </span>

            {step.skipped && !step.done ? (
              <>
                <Chip tone="neutral" size="xs">
                  Skipped
                </Chip>
                {step.onUndoSkip && (
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ flexShrink: 0 }}
                    onClick={step.onUndoSkip}
                  >
                    Undo skip
                  </Button>
                )}
              </>
            ) : step.done ? (
              <Chip tone="success" size="xs">
                Done
              </Chip>
            ) : step.locked ? (
              <Chip tone="neutral" size="xs">
                Locked
              </Chip>
            ) : (
              <>
                {step.skippable && step.onSkip && (
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ flexShrink: 0 }}
                    onClick={step.onSkip}
                    aria-label={`Skip ${step.label}`}
                  >
                    Skip
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ flexShrink: 0 }}
                  onClick={step.onAction}
                >
                  {step.actionLabel}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
};
