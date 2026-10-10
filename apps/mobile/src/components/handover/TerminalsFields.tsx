import React from 'react';
import { NumberField, TextField } from './Fields.js';
import { fieldId } from './steps.js';
import type { AssignedDu, DuFormState } from '../../lib/handover/model.js';

/**
 * Step 3 body: card and UPI per assigned Payment Terminal, or the aggregate
 * fallback when the Station runs none. Field errors come from steps.ts
 * (`errors`, keyed by `fieldId`), so what is highlighted is what blocks the save.
 */
export const TerminalsFields: React.FC<{
  du: AssignedDu;
  form: DuFormState;
  aggregateNonCashAllowed: boolean;
  /** field id -> message for this DU. */
  errors: Record<string, string>;
  onTerminalChange: (terminalId: string, field: 'card' | 'upi' | 'batch', value: string) => void;
  onAggregateChange: (field: 'aggregateCard' | 'aggregateUpi', value: string) => void;
}> = ({ du, form, aggregateNonCashAllowed, errors, onTerminalChange, onAggregateChange }) => {
  if (du.terminals.length > 0) {
    return (
      <>
        {du.terminals.map((t) => (
          <div
            key={t.terminalId}
            className="flex flex-col gap-2.5 rounded-xl border border-line bg-card-alt p-3"
          >
            <p className="text-xs font-bold text-text-high">{t.label}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {t.supportsCard !== false && (
                <NumberField
                  label="Card"
                  ariaLabel={`Card · ${t.label}`}
                  value={form.terminals[t.terminalId]?.card ?? ''}
                  onChange={(v) => onTerminalChange(t.terminalId, 'card', v)}
                  error={errors[fieldId.terminalCard(t.terminalId)]}
                />
              )}
              {t.supportsUpi !== false && (
                <NumberField
                  label="UPI"
                  ariaLabel={`UPI · ${t.label}`}
                  value={form.terminals[t.terminalId]?.upi ?? ''}
                  onChange={(v) => onTerminalChange(t.terminalId, 'upi', v)}
                  error={errors[fieldId.terminalUpi(t.terminalId)]}
                />
              )}
            </div>
            <TextField
              label="Batch ref (optional)"
              ariaLabel={`Batch ref (optional) · ${t.label}`}
              value={form.terminals[t.terminalId]?.batch ?? ''}
              onChange={(v) => onTerminalChange(t.terminalId, 'batch', v)}
            />
          </div>
        ))}
      </>
    );
  }
  if (aggregateNonCashAllowed) {
    return (
      <>
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField
            label="Card"
            value={form.aggregateCard}
            onChange={(v) => onAggregateChange('aggregateCard', v)}
            error={errors[fieldId.aggregateCard]}
          />
          <NumberField
            label="UPI"
            value={form.aggregateUpi}
            onChange={(v) => onAggregateChange('aggregateUpi', v)}
            error={errors[fieldId.aggregateUpi]}
          />
        </div>
        <p className="text-[11px] text-text-muted">
          Aggregate declaration used because no Payment Terminal is configured.
        </p>
      </>
    );
  }
  return (
    <p className="rounded-xl border border-line bg-card-alt p-3 text-xs text-text-muted">
      No Payment Terminal is assigned to this Dispenser. Card and UPI declarations require an
      assigned terminal.
    </p>
  );
};
