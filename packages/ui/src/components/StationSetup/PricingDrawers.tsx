import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudPricingService, CloudProductService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';
import { Drawer } from '../Drawer.js';
import { Field, MoneyInput, Select, TextInput } from '../primitives/Field.js';
import { queryKeys } from '../../query/hooks.js';
import { formatMoney } from '../../utils/format.js';
import { Button, Form } from '../../pump-ds/index.js';
import { useRunTask } from '../../utils/runTask.js';
import { stationDateTimeInput, stationInputToIso, type FuelPriceRow } from './fuelPriceRows.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';

const pricingService = new CloudPricingService();
const productService = new CloudProductService();

/** A non-fuel product as Pricing › Products reads it. */
export interface MerchRow {
  id: string;
  name: string;
  code?: string | null;
  brand?: string | null;
  category?: string | null;
  unit?: string | null;
  sellingPrice?: number | string | null;
  productType?: string;
  isActive?: boolean;
}

/**
 * Change a fuel's price (#537): the existing fuel-rate flow and validation, in
 * a drawer. "Effective from" is read on the station's clock, not the browser's.
 * Mounted per open, so each change gets its own Idempotency-Key session.
 */
export const ChangePriceDrawer: React.FC<{
  stationId: string;
  timeZone: string;
  fuels: FuelPriceRow[];
  initial: FuelPriceRow;
  onClose: () => void;
}> = ({ stationId, timeZone, fuels, initial, onClose }) => {
  const toast = useToast();
  const runTask = useRunTask();
  const qc = useQueryClient();
  // Mounted per open: one session per price change.
  const save = useKeyedSave(`setup:pricing:${stationId}`);
  const [productId, setProductId] = useState(initial.productId);
  const [price, setPrice] = useState('');
  // Computed once on open, so a re-render never fights the operator's edit.
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    stationDateTimeInput(new Date(), timeZone),
  );
  const [submitting, setSubmitting] = useState(false);
  const fuel = fuels.find((f) => f.productId === productId) ?? initial;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !price || submitting) return;
    const payload = {
      stationId,
      productId,
      price: parseFloat(price),
      effectiveFrom: stationInputToIso(effectiveFrom, timeZone),
    };
    try {
      setSubmitting(true);
      await save(payload, (idempotencyKey) =>
        pricingService.recordPricing(payload, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to record new price');
      setSubmitting(false);
      return;
    }
    toast.success('Fuel rate updated.');
    onClose();
    runTask(
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.pricing(stationId) }),
        qc.invalidateQueries({ queryKey: queryKeys.pricingHistory(stationId) }),
      ]),
      'Saved, but fuel pricing could not be refreshed.',
    );
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Change price"
      subtitle={
        fuel.price == null
          ? `${fuel.productName} · no price yet`
          : `${fuel.productName} · now ${formatMoney(fuel.price)}/${fuel.unit}`
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="change-price-form"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={!productId || !price}
          >
            Apply new rate
          </Button>
        </div>
      }
    >
      <Form id="change-price-form" onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Fuel product" required>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            {fuels.map((f) => (
              <option key={f.productId} value={f.productId}>
                {f.productName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Rate / ${fuel.unit} (₹)`} required>
          <MoneyInput
            step="0.01"
            placeholder="e.g. 96.43"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Effective from" required hint={`Station time (${timeZone})`}>
          <TextInput
            type="datetime-local"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            required
          />
        </Field>
      </Form>
    </Drawer>
  );
};

/** Set a product's MRP. Mounted per open, so each edit gets its own key session. */
export const MrpDrawer: React.FC<{ product: MerchRow; onClose: () => void }> = ({
  product,
  onClose,
}) => {
  const toast = useToast();
  const runTask = useRunTask();
  const qc = useQueryClient();
  const save = useKeyedSave(`setup:products:${product.id}`);
  const [value, setValue] = useState(
    product.sellingPrice != null ? String(product.sellingPrice) : '',
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const body = { sellingPrice: value === '' ? null : Number(value) };
    try {
      setSaving(true);
      await save(body, (idempotencyKey) =>
        productService.updateProduct(product.id, body, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update price');
      setSaving(false);
      return;
    }
    toast.success('Price updated.');
    onClose();
    runTask(
      qc.invalidateQueries({ queryKey: queryKeys.products() }),
      'Saved, but products could not be refreshed.',
    );
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Set price"
      subtitle={product.name}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" loading={saving} onClick={submit}>
            Save price
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-ink-muted">
          The MRP prefills this product on product sales. Leave it blank to clear it.
        </p>
        <Field label="MRP (₹)">
          <MoneyInput
            step="0.01"
            min="0"
            placeholder="e.g. 250"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </Field>
      </div>
    </Drawer>
  );
};
