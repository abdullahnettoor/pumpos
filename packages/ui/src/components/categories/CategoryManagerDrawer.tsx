import React, { useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Button, Chip, EmptyState, Input, Form, Icon } from '../../pump-ds/index.js';
import { useToast } from '../primitives/ToastProvider.js';
import { CATEGORY_API as API, type CategoryRecordKind, type CategoryTax } from './categoryApi.js';

export type { CategoryRecordKind };

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

type Tax = CategoryTax;

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
    <div className="w-[110px]">
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
    <div className="flex-1">
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

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={COPY[kind].title}>
      <div className="flex flex-col gap-4">
        {canManage && (
          <Form onSubmit={add}>
            <label className="field-label">New category</label>
            <div className="flex items-stretch gap-2">
              <div className="flex-1">
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
              <div className="mt-2 flex items-stretch gap-2">
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
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Categories
          </div>
          {sorted.length === 0 ? (
            <div className="py-2">
              <EmptyState
                compact
                icon={<Icon name="tag" size="md" />}
                title="No categories"
                description={canManage ? 'Add one above.' : 'None yet.'}
              />
            </div>
          ) : (
            sorted.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border-b border-border-soft py-2">
                {editingId === c.id ? (
                  <>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={100}
                        autoFocus
                      />
                      {taxed && (
                        <div className="flex gap-2">
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
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-ink-strong">{c.name}</span>
                      {taxed && hasTax(c) && (
                        <div className="mt-0.5 text-[12px] text-ink-muted">
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
