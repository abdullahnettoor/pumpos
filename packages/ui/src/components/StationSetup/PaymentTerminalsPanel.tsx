import React, { useState } from 'react';
import { CloudPaymentTerminalService, CloudFinanceService } from '../../services/cloud.js';
import { PaymentTerminal } from '@pump/shared';
import {
  Button,
  DataSection,
  EmptyState,
  Form,
  ConceptIcon,
  InteractiveTable,
  SectionHeader,
  type TableColumn,
} from '../../pump-ds/index.js';
import { Field, Select, TextInput } from '../primitives/Field.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { Drawer } from '../Drawer.js';
import { Checkbox } from '../primitives/Toggle.js';
import { ProviderField } from '../primitives/ProviderField.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useFinancialAccounts, usePaymentTerminals } from '../../query/hooks.js';

const terminalService = new CloudPaymentTerminalService();
const financeSvc = new CloudFinanceService();

export interface PaymentTerminalsPanelProps {
  stationId: string;
}

const Faint: React.FC = () => <span className="text-ink-faint">—</span>;

const buildTerminalColumns = (
  openEdit: (t: PaymentTerminal) => void,
  toggleActive: (t: PaymentTerminal) => void,
  clearingName: (id: string | null | undefined) => string,
): TableColumn<PaymentTerminal>[] => [
  {
    id: 'label',
    header: 'Label',
    kind: 'text',
    value: (t) => t.label,
    cell: (t) => <span className="font-medium text-ink-strong">{t.label}</span>,
  },
  {
    id: 'provider',
    header: 'Provider',
    kind: 'text',
    value: (t) => t.provider,
    cell: (t) => (t.provider ? <span>{t.provider}</span> : <Faint />),
  },
  {
    id: 'terminalCode',
    header: 'Terminal ID',
    kind: 'text',
    value: (t) => t.terminalCode,
    cell: (t) => (t.terminalCode ? <span className="font-mono">{t.terminalCode}</span> : <Faint />),
  },
  {
    id: 'accepts',
    header: 'Accepts',
    kind: 'text',
    value: (t) =>
      [t.supportsCard ? 'Card' : null, t.supportsUpi ? 'UPI' : null].filter(Boolean).join(' + ') ||
      null,
  },
  {
    id: 'clearing',
    header: 'Settles into',
    kind: 'text',
    value: (t) => clearingName((t as any).clearingAccountId),
    cell: (t) => (
      <span className="text-ink-muted">{clearingName((t as any).clearingAccountId)}</span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'status',
    value: (t) => (t.isActive ? 'active' : 'inactive'),
  },
  {
    id: 'actions',
    header: '',
    kind: 'text',
    sortable: false,
    value: () => null,
    cell: (t) => (
      <span className="inline-flex gap-2 whitespace-nowrap">
        <Button variant="secondary" size="xs" onClick={() => openEdit(t)}>
          Edit
        </Button>
        <Button variant="secondary" size="xs" onClick={() => toggleActive(t)}>
          {t.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      </span>
    ),
  },
];

export const PaymentTerminalsPanel: React.FC<PaymentTerminalsPanelProps> = ({ stationId }) => {
  const toast = useToast();
  const runTask = useRunTask();
  // Shared hooks rather than a loader copying into state behind an effect.
  const qc = useQueryClient();
  const terminalsQ = usePaymentTerminals(stationId);
  const accountsQ = useFinancialAccounts(stationId);
  const terminals: PaymentTerminal[] = (terminalsQ.data as PaymentTerminal[]) ?? [];
  const refreshTerminals = () =>
    qc.invalidateQueries({ queryKey: queryKeys.paymentTerminals(stationId ?? '') });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('');
  const [terminalCode, setTerminalCode] = useState('');
  const [supportsCard, setSupportsCard] = useState(true);
  const [supportsUpi, setSupportsUpi] = useState(true);
  const [clearingAccountId, setClearingAccountId] = useState('');
  // Clearing accounts are a filtered view of the station's financial accounts,
  // so derive rather than store. A failure here is non-fatal: the picker falls
  // back to "Auto (by provider)".
  const clearingAccounts: any[] = ((accountsQ.data as any[]) ?? []).filter(
    (a: any) => a.accountType === 'MERCHANT_CLEARING',
  );

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
      runTask(refreshTerminals(), 'Saved, but the terminal list could not be refreshed.');
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
      runTask(refreshTerminals(), 'Saved, but the terminal list could not be refreshed.');
      toast.success(t.isActive ? 'Terminal disabled.' : 'Terminal enabled.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update terminal');
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Payment terminals (PoS)"
        subtitle={terminalsQ.data ? countOf(terminals.length, 'terminal', 'terminals') : undefined}
        action={isFormOpen ? undefined : { label: 'Add terminal', onClick: openCreate }}
      />
      <p className="px-0.5 text-[12px] text-ink-muted">
        Card / UPI machines for this station. Add as many as needed; link them to dispensers when
        opening a shift.
      </p>
      <DataSection
        title="payment terminals"
        query={terminalsQ}
        placeholderHeight={160}
        flush
        isEmpty={terminals.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<ConceptIcon concept="payment-terminals" size="md" />}
              title="No payment terminals yet"
              description="Add your first PoS machine."
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={buildTerminalColumns(
            openEdit,
            (t) => runTask(toggleActive(t), 'Could not update the terminal.'),
            clearingName,
          )}
          rows={terminals}
          rowKey={(r) => r.id}
          title="payment terminals"
        />
      </DataSection>

      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title={editingId ? 'Edit Payment Terminal' : 'Add Payment Terminal'}
      >
        <Form onSubmit={handleSubmit} className="flex flex-col">
          <Field label="Label" required>
            <TextInput
              type="text"
              placeholder="e.g. Counter PoS"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </Field>

          <Field label="Provider / Acquirer">
            <ProviderField key={editingId ?? 'new'} value={provider} onChange={setProvider} />
          </Field>

          <Field label="Terminal ID (TID)">
            <TextInput
              type="text"
              className="font-mono"
              placeholder="Device TID"
              value={terminalCode}
              onChange={(e) => setTerminalCode(e.target.value)}
            />
          </Field>

          <div className="mb-4 flex gap-5">
            <Checkbox
              label="Accepts Card"
              checked={supportsCard}
              onChange={(e) => setSupportsCard(e.target.checked)}
            />
            <Checkbox
              label="Accepts UPI"
              checked={supportsUpi}
              onChange={(e) => setSupportsUpi(e.target.checked)}
            />
          </div>

          <Field
            label="Settles into (Card/UPI clearing account)"
            hint="Card/UPI from this machine settles into this account. Machines of the same acquirer (e.g. 4 Paytm) can share one — leave on Auto to group by provider."
          >
            <Select
              value={clearingAccountId}
              onChange={(e) => setClearingAccountId(e.target.value)}
            >
              <option value="">Auto — group by provider</option>
              {clearingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-2 border-t border-border-soft pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Terminal'}
            </Button>
          </div>
        </Form>
      </Drawer>
    </section>
  );
};
