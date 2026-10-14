import React, { useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Button, Chip, EmptyState, Input, Form, Icon } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';

const service = new CloudTransactionService();

export type CategoryRecordKind = 'expense' | 'income';

export interface CategoryManagerDrawerProps {
  /** Expense categories, or income categories (which also carry GST + HSN/SAC). */
  kind: CategoryRecordKind;
  isOpen: boolean;
  onClose: () => void;
  categories: any[];
  /** Called after a successful create/rename so the parent can refetch. */
  onChanged: () => void | Promise<unknown>;
  canManage: boolean;
}

type Tax = { gst_rate: number; hsn_code: string } | null;

const gstStr = (c: any) => {
  const t = c?.taxConfig;
  return t && t.gst_rate != null ? String(t.gst_rate) : '';
};
const hsnStr = (c: any) => {
  const t = c?.taxConfig;
  return t && t.hsn_code ? String(t.hsn_code) : '';
};
const hasTax = (c: any) => {
  const t = c?.taxConfig;
  return !!(t && (t.gst_rate != null || t.hsn_code));
};
const buildTax = (gst: string, hsn: string): Tax => {
  const g = gst.trim();
  const h = hsn.trim();
  if (!g && !h) return null;
  return { gst_rate: g ? Number(g) : 0, hsn_code: h };
};

const API = {
  expense: {
    create: (name: string) => service.createExpenseCategory({ name }),
    update: (id: string, name: string) => service.updateExpenseCategory(id, { name }),
  },
  income: {
    create: (name: string, taxConfig: Tax) => service.createIncomeCategory({ name, taxConfig }),
    update: (id: string, name: string, taxConfig: Tax) =>
      service.updateIncomeCategory(id, { name, taxConfig }),
  },
} as const;

const COPY = {
  expense: { title: 'Manage expense categories', placeholder: 'e.g. Vehicle maintenance' },
  income: { title: 'Manage income categories', placeholder: 'e.g. Tanker rental, commission' },
} as const;

/** GST % and HSN / SAC inputs of an income category. */
const TaxInputs: React.FC<{
  gst: string;
  hsn: string;
  onGst: (v: string) => void;
  onHsn: (v: string) => void;
}> = ({ gst, hsn, onGst, onHsn }) => (
  <>
    <div style={{ width: '110px' }}>
      <Input
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={gst}
        onChange={(e) => onGst(e.target.value)}
        placeholder="GST %"
        aria-label="GST rate %"
      />
    </div>
    <div style={{ flex: 1 }}>
      <Input
        value={hsn}
        onChange={(e) => onHsn(e.target.value)}
        placeholder="HSN / SAC (optional)"
        maxLength={20}
        aria-label="HSN / SAC code"
      />
    </div>
  </>
);

/**
 * Manage the categories of expenses or income: add one and rename any (seeded
 * defaults only differ by a "Default" tag). An income category also carries an
 * optional GST rate and HSN/SAC (`tax_config`, the product tax shape).
 * Archiving is deferred; see the API TODO.
 */
export const CategoryManagerDrawer: React.FC<CategoryManagerDrawerProps> = ({
  kind,
  isOpen,
  onClose,
  categories,
  onChanged,
  canManage,
}) => {
  const toast = useToast();
  const taxed = kind === 'income';
  const [newName, setNewName] = useState('');
  const [newGst, setNewGst] = useState('');
  const [newHsn, setNewHsn] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGst, setEditGst] = useState('');
  const [editHsn, setEditHsn] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const sorted = [...categories].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      setAdding(true);
      await API[kind].create(name, buildTax(newGst, newHsn));
      setNewName('');
      setNewGst('');
      setNewHsn('');
      await onChanged();
      toast.success('Category added.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditGst(gstStr(c));
    setEditHsn(hsnStr(c));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditGst('');
    setEditHsn('');
  };
  const saveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      setSavingId(id);
      await API[kind].update(id, name, buildTax(editGst, editHsn));
      cancelEdit();
      await onChanged();
      toast.success(taxed ? 'Category saved.' : 'Category renamed.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save category');
    } finally {
      setSavingId(null);
    }
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-soft)',
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={COPY[kind].title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {canManage && (
          <Form onSubmit={add}>
            <label className="field-label">New category</label>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={COPY[kind].placeholder}
                  maxLength={100}
                />
              </div>
              {!taxed && (
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  leftIcon={<Icon name="plus" size="sm" />}
                  loading={adding}
                  disabled={!newName.trim()}
                >
                  Add
                </Button>
              )}
            </div>
            {taxed && (
              <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px', marginTop: '8px' }}>
                <TaxInputs gst={newGst} hsn={newHsn} onGst={setNewGst} onHsn={setNewHsn} />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  leftIcon={<Icon name="plus" size="sm" />}
                  loading={adding}
                  disabled={!newName.trim()}
                >
                  Add
                </Button>
              </div>
            )}
          </Form>
        )}

        <div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            Categories
          </div>
          {sorted.length === 0 ? (
            <div style={{ padding: '8px 0' }}>
              <EmptyState
                compact
                icon={<Icon name="tag" size="md" />}
                title="No categories"
                description={canManage ? 'Add one above.' : 'None yet.'}
              />
            </div>
          ) : (
            sorted.map((c) => (
              <div key={c.id} style={rowStyle}>
                {editingId === c.id ? (
                  <>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={100}
                        autoFocus
                      />
                      {taxed && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <TaxInputs
                            gst={editGst}
                            hsn={editHsn}
                            onGst={setEditGst}
                            onHsn={setEditHsn}
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      iconOnly
                      leftIcon={<Icon name="check" size="xs" />}
                      aria-label="Save"
                      loading={savingId === c.id}
                      disabled={!editName.trim()}
                      onClick={() => saveEdit(c.id)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      leftIcon={<Icon name="x" size="xs" />}
                      aria-label="Cancel"
                      onClick={cancelEdit}
                    />
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{ fontSize: '13px', color: 'var(--text-strong)', fontWeight: 500 }}
                      >
                        {c.name}
                      </span>
                      {taxed && hasTax(c) && (
                        <div
                          style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}
                        >
                          GST {gstStr(c) || '0'}%{hsnStr(c) ? ` · HSN ${hsnStr(c)}` : ''}
                        </div>
                      )}
                    </div>
                    {c.isSystem && (
                      <Chip tone="neutral" size="xs">
                        Default
                      </Chip>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        leftIcon={<Icon name="pencil" size="xs" />}
                        aria-label={taxed ? 'Edit' : 'Rename'}
                        onClick={() => startEdit(c)}
                      />
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Drawer>
  );
};
