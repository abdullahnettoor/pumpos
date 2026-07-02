import React from 'react';
import { OnboardingDraft, OnboardingPaymentTerminalDraft } from '@pump/shared';
import { createPaymentTerminalDraft } from '../onboardingDraft.js';
import { Checkbox } from '../../primitives/Toggle.js';

interface Step8PaymentTerminalsProps {
  draft: OnboardingDraft;
  updateDraft: (updater: (prev: OnboardingDraft) => OnboardingDraft) => void;
  panelStyle: React.CSSProperties;
  fieldLabelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}

export const Step8PaymentTerminals: React.FC<Step8PaymentTerminalsProps> = ({
  draft,
  updateDraft,
  panelStyle,
  fieldLabelStyle,
  inputStyle,
}) => {
  const terminals = draft.paymentTerminals ?? [];

  const addTerminal = () => {
    const next = createPaymentTerminalDraft();
    next.label = `Terminal ${terminals.length + 1}`;
    updateDraft((prev) => ({ ...prev, paymentTerminals: [...(prev.paymentTerminals ?? []), next] }));
  };

  const updateTerminal = (draftId: string, patch: Partial<OnboardingPaymentTerminalDraft>) => {
    updateDraft((prev) => ({
      ...prev,
      paymentTerminals: (prev.paymentTerminals ?? []).map((t) => (t.draftId === draftId ? { ...t, ...patch } : t)),
    }));
  };

  const removeTerminal = (draftId: string) => {
    updateDraft((prev) => ({
      ...prev,
      paymentTerminals: (prev.paymentTerminals ?? []).filter((t) => t.draftId !== draftId),
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ ...panelStyle, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>Payment Terminals</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Add the card/UPI machines (POS devices) at this station. These are linked to dispensers when a shift
            is opened. Optional — you can run cash-only and add terminals later from Station Setup.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={addTerminal}>
          Add Terminal
        </button>
      </div>

      {terminals.length === 0 ? (
        <div style={{ ...panelStyle, padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          No payment terminals configured. You can still finish onboarding and add them later.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {terminals.map((terminal, idx) => (
            <div key={terminal.draftId} style={{ ...panelStyle, gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Terminal {idx + 1}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => removeTerminal(terminal.draftId)}
                  style={{ height: '24px', padding: '0 8px', fontSize: '11px', color: 'var(--state-danger-fg)' }}
                >
                  Remove
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={fieldLabelStyle}>Label *</label>
                  <input
                    style={inputStyle}
                    value={terminal.label}
                    onChange={(e) => updateTerminal(terminal.draftId, { label: e.target.value })}
                    placeholder="e.g. Counter HDFC POS"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={fieldLabelStyle}>Provider / Bank</label>
                  <input
                    style={inputStyle}
                    value={terminal.provider}
                    onChange={(e) => updateTerminal(terminal.draftId, { provider: e.target.value })}
                    placeholder="e.g. HDFC, Pine Labs"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={fieldLabelStyle}>Terminal ID (TID)</label>
                  <input
                    style={inputStyle}
                    value={terminal.terminalCode}
                    onChange={(e) => updateTerminal(terminal.draftId, { terminalCode: e.target.value })}
                    placeholder="Device TID"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <Checkbox
                  label="Accepts Card"
                  checked={terminal.supportsCard}
                  onChange={(e) => updateTerminal(terminal.draftId, { supportsCard: e.target.checked })}
                />
                <Checkbox
                  label="Accepts UPI"
                  checked={terminal.supportsUpi}
                  onChange={(e) => updateTerminal(terminal.draftId, { supportsUpi: e.target.checked })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
