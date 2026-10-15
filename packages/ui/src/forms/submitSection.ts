import type { FieldValues, UseFormHandleSubmit } from 'react-hook-form';

/** The error a section shows when its fields fail validation. */
export const INVALID_SECTION = 'Check the highlighted fields.';

/**
 * Runs a React Hook Form submit as a promise for the unsaved-changes bar
 * (#604): resolves once `persist` has saved the valid values, rejects with
 * `persist`'s error, or with `INVALID_SECTION` when the fields don't validate
 * (React Hook Form marks them).
 */
export function submitSection<T extends FieldValues>(
  handleSubmit: UseFormHandleSubmit<T>,
  persist: (values: T) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    void handleSubmit(
      async (values) => {
        try {
          await persist(values);
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new Error('That could not be saved.'));
        }
      },
      () => reject(new Error(INVALID_SECTION)),
    )();
  });
}
