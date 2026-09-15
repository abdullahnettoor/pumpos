import React, { useEffect, useRef, type FormHTMLAttributes } from 'react';
import { useAsyncAction } from '../../utils/useAsyncAction.js';

export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  /**
   * May be async. The returned promise is awaited, so a rejected submit lands
   * somewhere instead of becoming an unhandled rejection.
   *
   * This matters more than it looks with react-hook-form: `handleSubmit`
   * re-throws whatever the submit handler threw, so `onSubmit={handleSubmit(fn)}`
   * on a bare `<form>` drops every failure on the floor.
   */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void | Promise<unknown>;
  /**
   * Called when an async submit rejects. Defaults to logging and raising a
   * generic toast. Forms that can say something specific should catch inside
   * `onSubmit` and render their own inline error.
   */
  onSubmitError?: (error: unknown) => void;
  /**
   * Set while an async submit is in flight. Use it to disable the fieldset so
   * the form cannot be submitted twice, or to drive a button's spinner.
   */
  onSubmittingChange?: (submitting: boolean) => void;
}

/**
 * `<form>` that understands async submit handlers.
 *
 * Prefer this over a bare `<form>` anywhere the submit handler is async, which
 * in this codebase is everywhere: submits record expenses, collections and
 * shift closes.
 */
export const Form: React.FC<FormProps> = ({
  onSubmit,
  onSubmitError,
  onSubmittingChange,
  children,
  ...rest
}) => {
  const { pending, run } = useAsyncAction(onSubmit, 'That could not be saved.', onSubmitError);

  // Mirror the in-flight flag out to the caller, which owns the fieldset and
  // the submit button. Form itself renders nothing from it. The mount pass is
  // skipped: a form that has never been submitted should not announce that it
  // is not submitting.
  const notified = useRef(false);
  useEffect(() => {
    if (!notified.current && !pending) return;
    notified.current = true;
    onSubmittingChange?.(pending);
  }, [pending, onSubmittingChange]);

  return (
    <form {...rest} onSubmit={run}>
      {children}
    </form>
  );
};
