import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The one class-name helper for pump-ds. Composes `clsx` (conditional
 * classes) with `tailwind-merge` (deduplicates conflicting utilities so
 * `cn('p-2', 'p-4')` → `'p-4'`, not both).
 *
 * Outside pump-ds import it from `@pump/ui`; within the pump-ds tree use
 * the relative import `../lib/cn.js`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
