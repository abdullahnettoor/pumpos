import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The one class-name helper for pump-ds. Composes `clsx` (conditional
 * classes) with `tailwind-merge` (deduplicates conflicting utilities so
 * `cn('p-2', 'p-4')` → `'p-4'`, not both).
 *
 * Import as `import { cn } from '@pump/ui/pump-ds/lib/cn'` — but note that
 * within the pump-ds tree the shorter relative import is `../lib/cn.js`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
