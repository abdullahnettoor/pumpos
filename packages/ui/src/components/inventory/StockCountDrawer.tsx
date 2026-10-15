import React from 'react';
import { Button, Form, Icon, SegmentedControl } from '../../pump-ds/index.js';
import { formatQuantity } from '../../utils/format.js';
import { Banner } from '../primitives/Banner.js';
import { Field, NumberInput, Select, TextInput } from '../primitives/Field.js';
import { Drawer } from '../Drawer.js';
import type { ItemRow, TankRow } from './inventoryFigures.js';

export type CountScope = 'item' | 'tank';

export interface StockCountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  scope: CountScope;
  onScopeChange: (scope: CountScope) => void;
  targetId: string;
  onTargetChange: (id: string) => void;
  actual: string;
  onActualChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  items: readonly ItemRow[];
  tanks: readonly TankRow[];
  submitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

/**
 * Stock reconciliation (Reconcile stock): a physical count for one product or
 * one tank. The form state and the request stay with the page (InventoryList),
 * which owns the idempotent retry; this is the drawer's look only (#536).
 */
export const StockCountDrawer: React.FC<StockCountDrawerProps> = ({
  isOpen,
  onClose,
  scope,
  onScopeChange,
  targetId,
  onTargetChange,
  actual,
  onActualChange,
  reason,
  onReasonChange,
  items,
  tanks,
  submitting,
  error,
  onSubmit,
}) => (
  <Drawer isOpen={isOpen} onClose={onClose} title="Stock reconciliation">
    <Form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-[12px] leading-normal text-ink-muted">
        Enter the physically measured quantity. Book stock is reconciled to it (a variance is logged
        and an adjustment movement posts the difference). Use this to set an opening balance for a
        new product or correct a count.
      </p>
      {scope === 'tank' && (
        <Banner severity="warning" icon={null}>
          A dip taken while a Shift is open records the measurement and variance, but book stock is
          not adjusted: fuel dispensed during the open Shift is not yet booked, so the variance may
          include un-booked sales.
        </Banner>
      )}
      {error && (
        <Banner severity="danger" icon={null}>
          {error}
        </Banner>
      )}
      <Field label="Scope">
        <SegmentedControl<CountScope>
          aria-label="Scope"
          stretch
          size="md"
          value={scope}
          onChange={onScopeChange}
          options={[
            { value: 'item', label: 'Merchandise' },
            { value: 'tank', label: 'Fuel tank' },
          ]}
        />
      </Field>
      <Field label={scope === 'item' ? 'Product' : 'Tank'}>
        <Select value={targetId} onChange={(e) => onTargetChange(e.target.value)} required>
          {scope === 'item'
            ? items.map((i) => (
                <option key={i.productId} value={i.productId}>
                  {i.name}
                  {i.code ? ` (${i.code})` : ''} — on hand {formatQuantity(i.quantity, i.unit)}
                </option>
              ))
            : tanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.productName} — {formatQuantity(t.currentVolume, t.productUnit)}
                </option>
              ))}
        </Select>
      </Field>
      <Field label="Actual counted quantity">
        <NumberInput
          min="0"
          step="any"
          value={actual}
          onChange={(e) => onActualChange(e.target.value)}
          placeholder="Measured quantity"
          required
        />
      </Field>
      <Field label="Reason" hint="optional">
        <TextInput
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="e.g. opening stock, monthly count, breakage"
        />
      </Field>
      <div className="mt-1 flex gap-2">
        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          loading={submitting}
          disabled={!targetId || actual === ''}
          leftIcon={<Icon name="clipboard-check" size="sm" />}
        >
          Reconcile stock
        </Button>
        <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Form>
  </Drawer>
);
