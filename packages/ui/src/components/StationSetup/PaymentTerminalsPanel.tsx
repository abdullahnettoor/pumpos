import React, { useState, useEffect } from 'react';
import { CloudPaymentTerminalService } from '../../services/cloud.js';
import { PaymentTerminal } from '@pump/shared';
import { StatusBadge } from '../StatusBadge.js';
import { Drawer } from '../Drawer.js';

const terminalService = new CloudPaymentTerminalService();

export interface PaymentTerminalsPanelProps {
  stationId: string;
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
};

const inputStyle: React.CSSProperties = {
  height: '32px',
  padding: '0 8px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  fontSize: '13px',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-strong)',
};

export const PaymentTerminalsPanel: React.FC<PaymentTerminalsPanelProps> = ({ stationId }) => {
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('');
  const [terminalCode, setTerminalCode] = useState('');
  const [supportsCard, setSupportsCard] = useState(true);
  const [supportsUpi, setSupportsUpi] = useState(true);

  useEffect(() => {
    loadData();
  }, [stationId]);

  const loadData = async () => {
    if (!stationId) return;
    try {
      setLoading(true);
      const list = await terminalService.listTerminals(stationId);
      setTerminals(list);
    } catch (err) {
      console.error('Failed to load payment terminals:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setProvider('');
    setTerminalCode('');
    setSupportsCard(true);
    setSupportsUpi(true);
  };

  const openCreate = () => {
    resetForm();
    setLabel(`PoS ${terminals.length + 1}`);
    setIsFormOpen(true);
  };

  const openEdit = (t: PaymentTerminal) => {
    setEditingId(t.id);
    setLabel(t.label);
    setProvider(t.provider || '');
    setTerminalCode(t.terminalCode || '');
    setSupportsCard(t.supportsCard);
    setSupportsUpi(t.supportsUpi);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      const payload = {
        label: label.trim(),
        provider: provider.trim() || null,
        terminalCode: terminalCode.trim() || null,
        supportsCard,
        supportsUpi,
      };
      if (editingId) {
        await terminalService.updateTerminal(editingId, payload);
      } else {
        await terminalService.createTerminal({ stationId, ...payload });
      }
      setIsFormOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save payment terminal');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (t: PaymentTerminal) => {
    try {
      await terminalService.updateTerminal(t.id, { isActive: !t.isActive });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update terminal');
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading payment terminals...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Payment Terminals (PoS)</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Card / UPI machines for this station. Add as many as needed; link them to dispensers when opening a shift.
          </p>
        </div>
        {!isFormOpen && (
          <button
            onClick={openCreate}
            style={{
              height: '32px',
              padding: '0 12px',
              backgroundColor: 'var(--brand-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            + Add Terminal
          </button>
        )}
      </div>

      {terminals.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-card)' }}>
          No payment terminals yet. Add your first PoS machine.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Label</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Provider</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Terminal ID</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Accepts</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {terminals.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-strong)', fontWeight: 500 }}>{t.label}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-default)' }}>{t.provider || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-default)', fontFamily: 'var(--font-mono)' }}>{t.terminalCode || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-default)' }}>
                    {[t.supportsCard ? 'Card' : null, t.supportsUpi ? 'UPI' : null].filter(Boolean).join(' + ') || '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <StatusBadge status={t.isActive ? 'Active' : 'Inactive'} type={t.isActive ? 'success' : 'default'} />
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => openEdit(t)}
                      style={{ marginRight: '8px', padding: '4px 8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--text-default)', borderRadius: 'var(--radius-button)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(t)}
                      style={{ padding: '4px 8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--text-default)', borderRadius: 'var(--radius-button)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {t.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title={editingId ? 'Edit Payment Terminal' : 'Add Payment Terminal'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={labelStyle}>Label *</label>
            <input
              type="text"
              style={inputStyle}
              placeholder="e.g. Counter PoS"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={labelStyle}>Provider / Bank</label>
            <input
              type="text"
              style={inputStyle}
              placeholder="e.g. HDFC, ICICI, Pine Labs"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={labelStyle}>Terminal ID (TID)</label>
            <input
              type="text"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
              placeholder="Device TID"
              value={terminalCode}
              onChange={(e) => setTerminalCode(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-default)' }}>
              <input type="checkbox" checked={supportsCard} onChange={(e) => setSupportsCard(e.target.checked)} />
              Accepts Card
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-default)' }}>
              <input type="checkbox" checked={supportsUpi} onChange={(e) => setSupportsUpi(e.target.checked)} />
              Accepts UPI
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-soft)', paddingTop: '16px' }}>
            <button
              type="button"
              onClick={() => { resetForm(); setIsFormOpen(false); }}
              style={{ height: '34px', padding: '0 14px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--text-default)', borderRadius: 'var(--radius-button)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{ height: '34px', padding: '0 14px', backgroundColor: 'var(--brand-primary)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-button)', fontWeight: 600, fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Terminal'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
};
