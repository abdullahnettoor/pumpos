import React, { useState } from 'react';
import { SegmentedControl } from '../../../pump-ds/index.js';
import { TaxRegisterPanel } from '../TaxRegisterPanel.js';
import { PurchaseGstPanel } from './PurchaseGstPanel.js';
import { IncomeGstPanel } from './IncomeGstPanel.js';

export type GstView = 'sales' | 'purchases' | 'income';

const VIEWS = [
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases (ITC)' },
  { value: 'income', label: 'Income' },
] as const;

/**
 * The one GST report (#540): sales (output tax register), purchases (input
 * credit) and income (output GST), which used to live on the Reports, Purchases
 * and Income pages. Each view is the panel that was there, unchanged.
 */
export const GstReport: React.FC<{
  selectedStation: any | null;
  /** View to open on (a deep link from Suppliers or Income). */
  initialView?: GstView;
  /** Called when the operator picks a view, so a deep link stops reasserting. */
  onViewChange?: (view: GstView) => void;
}> = ({ selectedStation, initialView, onViewChange }) => {
  const [picked, setPicked] = useState<GstView>(initialView ?? 'sales');
  const view = initialView ?? picked;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SegmentedControl
        aria-label="GST view"
        options={VIEWS}
        value={view}
        onChange={(v) => {
          setPicked(v);
          onViewChange?.(v);
        }}
      />
      {view === 'sales' && <TaxRegisterPanel selectedStation={selectedStation} />}
      {view === 'purchases' && <PurchaseGstPanel selectedStation={selectedStation} />}
      {view === 'income' && <IncomeGstPanel selectedStation={selectedStation} />}
    </div>
  );
};
