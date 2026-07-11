import React, { useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Field, TextInput } from '../primitives/Field.js';
import { Button, Chip, EmptyState } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';
import { Pencil, Plus, Check, X, Tag } from 'lucide-react';

const service = new CloudTransactionService();

export interface CategoryManagerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  categories: any[];
  /** Called after a successful create/rename so the parent can refetch. */
  onChanged: () => void;
  canManage: boolean;
}

/**
 * Manage expense categories: add custom categories and rename them. System
 * (seeded) categories are read-only. Archiving is deferred — see the API TODO.
 */
export const CategoryManagerDrawer: React.FC<CategoryManagerDrawerProps> = ({ isOpen, onClose, categories, onChanged, canManage }) => {
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const custom = categories.filter((c) => !c.isSystem);
  const system = categories.filter((c) => c.isSystem);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      setAdding(true);
      await service.createExpenseCategory({ name });
      setNewName('');
      onChanged();
      toast.success('Category added.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: any) => { setEditingId(c.id); setEditName(c.name); };
  const cancelEdit = () => { setEditingId(null); setEditName(''); };
  const saveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      setSavingId(id);
      await service.updateExpenseCategory(id, { name });
      cancelEdit();
      onChanged();
      toast.success('Category renamed.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to rename category');
    } finally {
      setSavingId(null);
    }
  };

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Manage expense categories">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {canManage && (
          <form onSubmit={add} style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <Field label="New category">
                <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Vehicle maintenance" maxLength={100} />
              </Field>
            </div>
            <Button type="submit" variant="primary" size="md" leftIcon={<Plus />} loading={adding} disabled={!newName.trim()}>Add</Button>
          </form>
        )}

        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Custom</div>
          {custom.length === 0 ? (
            <div style={{ padding: '8px 0' }}><EmptyState compact icon={<Tag />} title="No custom categories" description={canManage ? 'Add one above.' : 'None yet.'} /></div>
          ) : (
            custom.map((c) => (
              <div key={c.id} style={rowStyle}>
                {editingId === c.id ? (
                  <>
                    <div style={{ flex: 1 }}>
                      <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100} autoFocus />
                    </div>
                    <Button variant="primary" size="sm" iconOnly leftIcon={<Check />} aria-label="Save" loading={savingId === c.id} disabled={!editName.trim()} onClick={() => saveEdit(c.id)} />
                    <Button variant="ghost" size="sm" iconOnly leftIcon={<X />} aria-label="Cancel" onClick={cancelEdit} />
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-strong)', fontWeight: 500 }}>{c.name}</span>
                    {canManage && <Button variant="ghost" size="sm" iconOnly leftIcon={<Pencil />} aria-label="Rename" onClick={() => startEdit(c)} />}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>System</div>
          {system.map((c) => (
            <div key={c.id} style={rowStyle}>
              <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-default)' }}>{c.name}</span>
              <Chip tone="neutral" size="xs">Default</Chip>
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
};
