import React, { useCallback, useEffect, useRef, useState, type FormHTMLAttributes } from 'react';
import { useOptionalToast } from '../../components/primitives/ToastProvider.js';

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
  const toast = useOptionalToast();
  // A successful submit usually closes the drawer that owns this form, so the
  // promise can settle after unmount.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      const result = onSubmit?.(event);
      if (!(result instanceof Promise)) return;
      setSubmitting(true);
      onSubmittingChange?.(true);
      result
        .catch((error: unknown) => {
          if (onSubmitError) {
            onSubmitError(error);
            return;
          }
          console.error('Form submit failed:', error);
          toast?.error('That could not be saved.');
        })
        .finally(() => {
          if (!mounted.current) return;
          setSubmitting(false);
          onSubmittingChange?.(false);
        });
    },
    [onSubmit, onSubmitError, onSubmittingChange, toast],
  );

  return (
    <form {...rest} onSubmit={handleSubmit}>
      {children}
    </form>
  );
};
