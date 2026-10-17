import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { DecantationFlagResult, DecantationSettings } from '@pump/shared';
import type { DecantationFormValues } from './decantationForm.js';
import type { reviewDecantation } from './decantationReview.js';

export interface TankOption {
  id: string;
  name: string;
  productId: string;
  productName: string;
  currentVolume: number | null;
  /** Tank capacity, for the "of 20,000 L · 65%" line (#603). */
  capacity?: number | null;
  /** The product's unit (L, or kg for CNG). */
  unit?: string | null;
}

export interface StepProps {
  form: UseFormReturn<DecantationFormValues>;
  values: DecantationFormValues;
  tanks: TankOption[];
  settings: DecantationSettings;
  flags: DecantationFlagResult;
  review: ReturnType<typeof reviewDecantation>;
}

/** Equal-width field grids of the step bodies. */
export const GRID = {
  2: 'grid grid-cols-2 gap-2.5',
  3: 'grid grid-cols-3 gap-2.5',
  4: 'grid grid-cols-4 gap-2.5',
} as const;

/**
 * Identity colours of the tank lines (dot + left rule), cycled by line index.
 * Neutral/brand/info only: red and amber mean a problem, never a line.
 */
const LINE_SWATCH = ['bg-info-fg', 'bg-brand', 'bg-ink-default', 'bg-ink-faint'] as const;
const LINE_BORDER = [
  'border-l-info-fg',
  'border-l-brand',
  'border-l-ink-default',
  'border-l-ink-faint',
] as const;

export const lineSwatch = (i: number) => LINE_SWATCH[i % LINE_SWATCH.length];
export const lineBorder = (i: number) => LINE_BORDER[i % LINE_BORDER.length];

export const tankOf = (tanks: TankOption[], id: string) => tanks.find((t) => t.id === id);
export const lineLabel = (tanks: TankOption[], tankId: string, i: number) => {
  const t = tankOf(tanks, tankId);
  return t ? `${t.name} · ${t.productName}` : `Tank line ${i + 1}`;
};

/** Vertical stack used by every collapsed step summary. */
export const SummaryCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col gap-1.5">{children}</div>
);
