import React, { useState, useEffect } from 'react';
import { CloudPaymentTerminalService, CloudFinanceService } from '../../services/cloud.js';
import { PaymentTerminal } from '@pump/shared';
import { Chip } from '../../pump-ds/index.js';
import { Drawer } from '../Drawer.js';
import { DataTable } from '../primitives/DataTable.js';
import { Checkbox } from '../primitives/Toggle.js';
import { ProviderField } from '../primitives/ProviderField.js';
import { useToast } from '../primitives/ToastProvider.js';
import type { ColumnDef } from '@tanstack/react-table';

const terminalService = new CloudPaymentTerminalService();
const financeSvc = new CloudFinanceService();

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

const buildTerminalColumns = (openEdit: (t: any) => void, toggleActive: (t: any) => void, clearingName: (id: string | null | undefined) => string): ColumnDef<any, any>[] => [
  { accessorKey: 'label', header: 'Label', cell: ({ getValue }) => <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{getValue() as string}</span> },
  { accessorKey: 'provider', header: 'Provider', cell: ({ getValue }) => <span style={{ color: 'var(--text-default)' }}>{(getValue() as string) || '—'}</span> },
  { accessorKey: 'terminalCode', header: 'Terminal ID', cell: ({ getValue }) => <span style={{ color: 'var(--text-default)', fontFamily: 'var(--font-mono)' }}>{(getValue() as string) || '—'}</span> },
  {
    id: 'accepts',
    header: 'Accepts',
    cell: ({ row }) => {
      const t = row.original;
      return <span style={{ color: 'var(--text-default)' }}>{[t.supportsCard ? 'Card' : null, t.supportsUpi ? 'UPI' : null].filter(Boolean).join(' + ') || '—'}</span>;
    },
  },
  {
    id: 'clearing',
    header: 'Settles into',
    cell: ({ row }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{clearingName(row.original.clearingAccountId)}</span>,
  },
  { accessorKey: 'isActive', header: 'Status', cell: ({ getValue }) => <Chip tone={getValue() ? 'success' : 'neutral'} size="sm">{getValue() ? 'Active' : 'Inactive'}</Chip> },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const t = row.original;
      return (
        <div style={{ display: 'flex', gap: '8px', whiteSpace: 'nowrap' }}>
          <button onClick={() => openEdit(t)} style={{ padding: '4px 8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--text-default)', borderRadius: 'var(--radius-button)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
          <button onClick={() => toggleActive(t)} style={{ padding: '4px 8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--text-default)', borderRadius: 'var(--radius-button)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>{t.isActive ? 'Deactivate' : 'Reactivate'}</button>
        </div>
      );
    },
  },
];

export const PaymentTerminalsPanel: React.FC<PaymentTerminalsPanelProps> = ({ stationId }) => {
  const toast = useToast();
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
  const [clearingAccountId, setClearingAccountId] = useState('');
  const [clearingAccounts, setClearingAccounts] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [stationId]);

  const loadData = async () => {
    if (!stationId) return;
    try {
      setLoading(true);
      const [list, accounts] = await Promise.all([
        terminalService.listTerminals(stationId),
        financeSvc.listAccounts(stationId).catch(() => []),
      ]);
      setTerminals(list);
      setClearingAccounts((accounts || []).filter((a: any) => a.accountType === 'MERCHANT_CLEARING'));
    } catch (err) {
      console.error('Failed to load payment terminals:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearingName = (id: string | null | undefined) => {
    if (!id) return 'Auto (by provider)';
    return clearingAccounts.find((a) => a.id === id)?.name ?? 'Clearing account';
  };

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setProvider('');
    setTerminalCode('');
    setSupportsCard(true);
    setSupportsUpi(true);
    setClearingAccountId('');
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
    setClearingAccountId((t as any).clearingAccountId || '');
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
        clearingAccountId: clearingAccountId || null,
      };
      if (editingId) {
        await terminalService.updateTerminal(editingId, payload);
      } else {
        await terminalService.createTerminal({ stationId, ...payload });
      }
      setIsFormOpen(false);
      resetForm();
      loadData();
      toast.success(editingId ? 'Terminal updated.' : 'Terminal added.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save payment terminal');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (t: PaymentTerminal) => {
    try {
      await terminalService.updateTerminal(t.id, { isActive: !t.isActive });
      loadData();
      toast.success(t.isActive ? 'Terminal disabled.' : 'Terminal enabled.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update terminal');
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

      <DataTable
        columns={buildTerminalColumns(openEdit, toggleActive, clearingName)}
        data={terminals}
        emptyMessage="No payment terminals yet. Add your first PoS machine."
        getRowId={(r: any) => r.id}
      />

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
            <label style={labelStyle}>Provider / Acquirer</label>
            <ProviderField key={editingId ?? 'new'} value={provider} onChange={setProvider} style={inputStyle} />
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
            <Checkbox label="Accepts Card" checked={supportsCard} onChange={(e) => setSupportsCard(e.target.checked)} />
            <Checkbox label="Accepts UPI" checked={supportsUpi} onChange={(e) => setSupportsUpi(e.target.checked)} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={labelStyle}>Settles into (Card/UPI clearing account)</label>
            <select style={inputStyle} value={clearingAccountId} onChange={(e) => setClearingAccountId(e.target.value)}>
              <option value="">Auto — group by provider</option>
              {clearingAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Card/UPI from this machine settles into this account. Machines of the same acquirer (e.g. 4 Paytm) can share one — leave on Auto to group by provider.
            </span>
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
