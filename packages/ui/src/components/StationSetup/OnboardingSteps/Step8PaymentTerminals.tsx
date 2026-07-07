import React from 'react';
import { OnboardingDraft, OnboardingPaymentTerminalDraft } from '@pump/shared';
import { createPaymentTerminalDraft } from '../onboardingDraft.js';
import { Checkbox } from '../../primitives/Toggle.js';
import { ProviderField } from '../../primitives/ProviderField.js';

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
  const [quickProvider, setQuickProvider] = React.useState('');
  const [quickCount, setQuickCount] = React.useState(2);

  const addTerminal = () => {
    const next = createPaymentTerminalDraft();
    next.label = `Terminal ${terminals.length + 1}`;
    updateDraft((prev) => ({ ...prev, paymentTerminals: [...(prev.paymentTerminals ?? []), next] }));
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
        draftTerminal.label = provider ? `${provider} POS ${n}` : `Terminal ${existing.length + i + 1}`;
        additions.push(draftTerminal);
      }
      return { ...prev, paymentTerminals: [...existing, ...additions] };
    });
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

      {/* Quick fill: create N identical machines from one provider at once. */}
      <div style={{ ...panelStyle, gap: '12px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Quick add
        </span>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '220px', flex: 1 }}>
            <label style={fieldLabelStyle}>Provider / Acquirer</label>
            <ProviderField value={quickProvider} onChange={setQuickProvider} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '120px' }}>
            <label style={fieldLabelStyle}>No. of machines</label>
            <input
              type="number"
              min={1}
              max={50}
              style={inputStyle}
              value={quickCount}
              onChange={(e) => setQuickCount(Number(e.target.value))}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={quickAdd}
            disabled={!quickProvider.trim() || quickCount < 1}
            style={{ height: '32px' }}
          >
            Add {Math.max(1, Math.min(50, Math.floor(quickCount) || 1))} machine{Math.max(1, Math.min(50, Math.floor(quickCount) || 1)) > 1 ? 's' : ''}
          </button>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
          Creates machines labelled "{quickProvider.trim() || 'Provider'} POS 1", "…POS 2" — you can rename or set each TID below.
        </span>
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
                  <label style={fieldLabelStyle}>Provider / Acquirer</label>
                  <ProviderField
                    key={terminal.draftId}
                    value={terminal.provider}
                    onChange={(v) => updateTerminal(terminal.draftId, { provider: v })}
                    style={inputStyle}
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
