import React, { useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Button, Chip, EmptyState, Input } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';
import { Pencil, Plus, Check, X, Tag } from 'lucide-react';

const service = new CloudTransactionService();

export interface IncomeCategoryManagerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  categories: any[];
  /** Called after a successful create/rename so the parent can refetch. */
  onChanged: () => void;
  canManage: boolean;
}

/**
 * Manage income categories: add custom categories, rename them, and set an
 * optional GST rate + HSN/SAC on each (stored in `tax_config`, mirroring the
 * product tax shape). Seeded defaults are editable too — they only differ by a
 * "Default" tag. The tax config is captured now; GST-on-income reporting reads
 * it later (FI4).
 */
const gstStr = (c: any) => { const t = c?.taxConfig; return t && t.gst_rate != null ? String(t.gst_rate) : ''; };
const hsnStr = (c: any) => { const t = c?.taxConfig; return t && t.hsn_code ? String(t.hsn_code) : ''; };
const hasTax = (c: any) => { const t = c?.taxConfig; return !!(t && (t.gst_rate != null || t.hsn_code)); };
const buildTax = (gst: string, hsn: string): { gst_rate: number; hsn_code: string } | null => {
  const g = gst.trim(); const h = hsn.trim();
  if (!g && !h) return null;
  return { gst_rate: g ? Number(g) : 0, hsn_code: h };
};

export const IncomeCategoryManagerDrawer: React.FC<IncomeCategoryManagerDrawerProps> = ({ isOpen, onClose, categories, onChanged, canManage }) => {
  const toast = useToast();
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
      await service.createIncomeCategory({ name, taxConfig: buildTax(newGst, newHsn) });
      setNewName(''); setNewGst(''); setNewHsn('');
      onChanged();
      toast.success('Category added.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: any) => { setEditingId(c.id); setEditName(c.name); setEditGst(gstStr(c)); setEditHsn(hsnStr(c)); };
  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditGst(''); setEditHsn(''); };
  const saveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      setSavingId(id);
      await service.updateIncomeCategory(id, { name, taxConfig: buildTax(editGst, editHsn) });
      cancelEdit();
      onChanged();
      toast.success('Category saved.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save category');
    } finally {
      setSavingId(null);
    }
  };

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Manage income categories">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {canManage && (
          <form onSubmit={add}>
            <label className="field-label">New category</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tanker rental, commission" maxLength={100} />
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px', marginTop: '8px' }}>
              <div style={{ width: '110px' }}>
                <Input type="number" min={0} max={100} step="0.01" value={newGst} onChange={(e) => setNewGst(e.target.value)} placeholder="GST %" aria-label="GST rate %" />
              </div>
              <div style={{ flex: 1 }}>
                <Input value={newHsn} onChange={(e) => setNewHsn(e.target.value)} placeholder="HSN / SAC (optional)" maxLength={20} aria-label="HSN / SAC code" />
              </div>
              <Button type="submit" variant="primary" size="md" leftIcon={<Plus />} loading={adding} disabled={!newName.trim()}>Add</Button>
            </div>
          </form>
        )}

        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Categories</div>
          {sorted.length === 0 ? (
            <div style={{ padding: '8px 0' }}><EmptyState compact icon={<Tag />} title="No categories" description={canManage ? 'Add one above.' : 'None yet.'} /></div>
          ) : (
            sorted.map((c) => (
              <div key={c.id} style={rowStyle}>
                {editingId === c.id ? (
                  <>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100} autoFocus />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ width: '110px' }}>
                          <Input type="number" min={0} max={100} step="0.01" value={editGst} onChange={(e) => setEditGst(e.target.value)} placeholder="GST %" aria-label="GST rate %" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <Input value={editHsn} onChange={(e) => setEditHsn(e.target.value)} placeholder="HSN / SAC (optional)" maxLength={20} aria-label="HSN / SAC code" />
                        </div>
                      </div>
                    </div>
                    <Button variant="primary" size="sm" iconOnly leftIcon={<Check />} aria-label="Save" loading={savingId === c.id} disabled={!editName.trim()} onClick={() => saveEdit(c.id)} />
                    <Button variant="ghost" size="sm" iconOnly leftIcon={<X />} aria-label="Cancel" onClick={cancelEdit} />
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-strong)', fontWeight: 500 }}>{c.name}</span>
                      {hasTax(c) && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          GST {gstStr(c) || '0'}%{hsnStr(c) ? ` · HSN ${hsnStr(c)}` : ''}
                        </div>
                      )}
                    </div>
                    {c.isSystem && <Chip tone="neutral" size="xs">Default</Chip>}
                    {canManage && <Button variant="ghost" size="sm" iconOnly leftIcon={<Pencil />} aria-label="Edit" onClick={() => startEdit(c)} />}
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
