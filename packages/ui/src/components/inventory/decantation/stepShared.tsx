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
}

export interface StepProps {
  form: UseFormReturn<DecantationFormValues>;
  values: DecantationFormValues;
  tanks: TankOption[];
  settings: DecantationSettings;
  flags: DecantationFlagResult;
  review: ReturnType<typeof reviewDecantation>;
}

export const grid = (cols: string): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: cols,
  gap: 10,
});

export const tankOf = (tanks: TankOption[], id: string) => tanks.find((t) => t.id === id);
export const lineLabel = (tanks: TankOption[], tankId: string, i: number) => {
  const t = tankOf(tanks, tankId);
  return t ? `${t.name} · ${t.productName}` : `Tank line ${i + 1}`;
};

/** Vertical stack used by every collapsed step summary. */
export const SummaryCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
);
