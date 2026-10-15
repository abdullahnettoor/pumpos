import React, { type ReactNode } from 'react';
import { Button } from '../button/Button.js';

export interface UnsavedChangesBarProps {
  /** The form differs from what is saved. The bar renders only then. */
  dirty: boolean;
  /** Puts the form back to the saved values. */
  onDiscard: () => void;
  /**
   * Saves from outside a single form (one bar for several sections). Without
   * it, Save is the submit button of the `<form>` the bar sits in.
   */
  onSave?: () => void;
  /** A save is in flight: Save spins and both buttons wait. */
  saving?: boolean;
  /** The Save button's words. Defaults to "Save". */
  saveLabel?: string;
  /** The bar's words. Defaults to "Unsaved changes". */
  label?: ReactNode;
}

/**
 * Unsaved-changes bar (#604) for an in-page edit form (Station details,
 * Organization profile, station rules): "Unsaved changes · Discard · Save",
 * shown only while the form is dirty, in place of an always-visible Save.
 *
 * Place it last inside the `<form>`: Save is the form's submit button, the
 * primary. A tab with several forms uses one bar for all of them
 * (`UnsavedSectionsProvider` + `UnsavedSectionsBar`), whose Save saves each. The bar sticks to the bottom of the content area, so a long form
 * keeps it in reach. A drawer keeps its own footer; this is for forms that
 * live on the page.
 */
export const UnsavedChangesBar: React.FC<UnsavedChangesBarProps> = ({
  dirty,
  onDiscard,
  onSave,
  saving = false,
  saveLabel = 'Save',
  label = 'Unsaved changes',
}) => {
  if (!dirty) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      data-unsaved-changes-bar=""
      className="sticky bottom-0 z-10 flex animate-fade-in flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-soft bg-surface px-4 py-2.5 shadow-(--shadow-popover)"
    >
      <span className="text-[13px] font-medium text-ink-strong">{label}</span>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button
          type={onSave ? 'button' : 'submit'}
          variant="primary"
          size="sm"
          loading={saving}
          onClick={onSave}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
};
