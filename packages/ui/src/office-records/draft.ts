import { useEffect } from 'react';

/**
 * What a form tells the drawer while the operator types, for the live preview.
 * Ids only: the drawer resolves names and balances from its caches.
 */
export interface FormDraft {
  date: string;
  amount: number | null;
  categoryId?: string;
  partyId?: string;
  accountId?: string;
  terminalId?: string;
  purchase?: { type: 'FUEL' | 'PRODUCTS'; payNow: number | null; stockLines: string[] };
  /** The record can't be saved as it stands (a product purchase on a closed day). */
  blocked?: boolean;
}

export interface OfficeRecordFormProps<V> {
  /** The `<form>` id; the drawer's footer submits it. */
  formId: string;
  /** Launch defaults plus what "Add another after saving" carries over. */
  defaultValues?: Partial<V>;
  onDraftChange: (draft: FormDraft) => void;
}

/** A number typed into a money field, or null while it is empty or not a number. */
export const typedAmount = (value: unknown): number | null => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Tell the drawer about a changed draft (once per real change, not per render). */
export function useReportDraft(draft: FormDraft, onDraftChange: (draft: FormDraft) => void) {
  const signature = JSON.stringify(draft);
  useEffect(() => {
    onDraftChange(JSON.parse(signature) as FormDraft);
  }, [signature, onDraftChange]);
}
