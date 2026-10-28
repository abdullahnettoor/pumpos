import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Field, Select, TextInput } from '../../components/primitives/Field.js';
import { Button } from '../../pump-ds/index.js';
import {
  CATEGORY_API,
  type CategoryRecordKind as CategoryKind,
} from '../../components/categories/categoryApi.js';
import { queryKeys } from '../../query/hooks.js';
import { useOfficeRecordContext } from '../context.js';

const NEW = '__new';

export type { CategoryKind };

export interface CategoryFieldProps {
  kind: CategoryKind;
  categories: readonly { id: string; name: string; taxConfig?: { gst_rate?: number } | null }[];
  value: string;
  onChange: (id: string) => void;
  /** Owner, Manager and Accountant may add a category from the picker. */
  canAdd: boolean;
  error?: string;
}

const gstNote = (c: { taxConfig?: { gst_rate?: number } | null }) => {
  const rate = Number(c.taxConfig?.gst_rate ?? 0);
  return rate > 0 ? ` · GST ${rate}%` : '';
};

/**
 * The category picker of an expense or income, with "+ New category…" for the
 * roles that manage categories: an inline name and Add, then the new category
 * is chosen. The categories cache is refreshed so every screen sees it.
 */
export const CategoryField: React.FC<CategoryFieldProps> = ({
  kind,
  categories,
  value,
  onChange,
  canAdd,
  error,
}) => {
  const { disabled } = useOfficeRecordContext();
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const add = async () => {
    const name = (adding ?? '').trim();
    if (!name) return;
    try {
      setSaving(true);
      setAddError(null);
      const created = await CATEGORY_API[kind].create(name);
      const key = kind === 'income' ? queryKeys.incomeCategories() : queryKeys.expenseCategories();
      qc.setQueryData<any[]>(key, (old) => [...(old ?? []), created]);
      void qc.invalidateQueries({ queryKey: key });
      setAdding(null);
      if (created?.id) onChange(created.id);
    } catch (err: any) {
      setAddError(err?.message || 'Could not add the category.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field label="Category" required error={error ?? addError ?? undefined}>
      <Select
        name="categoryId"
        aria-label="Category"
        value={adding !== null ? NEW : value}
        invalid={!!error}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setAdding('');
            return;
          }
          setAdding(null);
          onChange(e.target.value);
        }}
      >
        <option value="">Choose a category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {kind === 'income' ? gstNote(c) : ''}
          </option>
        ))}
        {canAdd && <option value={NEW}>+ New category…</option>}
      </Select>
      {adding !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <TextInput
              aria-label="New category name"
              placeholder="Category name"
              maxLength={100}
              autoFocus
              value={adding}
              disabled={saving}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void add();
                } else if (e.key === 'Escape') {
                  // Esc leaves the new name first; the next Esc closes the drawer.
                  e.stopPropagation();
                  setAdding(null);
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={saving}
            disabled={!adding.trim()}
            onClick={() => void add()}
          >
            Add
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(null)}>
            Cancel
          </Button>
        </div>
      )}
      {adding !== null && !addError && (
        <span className="field-hint">
          Added to the {kind} categories. Rename it later in Categories.
        </span>
      )}
    </Field>
  );
};
