import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudProductService } from '../../services/cloud.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
import { Drawer } from '../Drawer.js';
import { Field, MoneyInput, Select, TextInput } from '../primitives/Field.js';
import { queryKeys, useRecordFuelPrice } from '../../query/hooks.js';
import { formatMoney } from '../../utils/format.js';
import { Button, Form } from '../../pump-ds/index.js';
import { useRefreshTask, useRunTask } from '../../utils/runTask.js';
import {
  stationDateTimeInput,
  stationInputToIso,
  type FuelPriceAttempt,
  type FuelPriceRow,
} from './fuelPriceRows.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { patchQueryData } from '../../query/patches/applyPatch.js';
import { withProductPrice } from '../../query/patches/products.js';
import { isScheduledFuelPrice } from '@pump/shared';

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
 *
 * Applying closes the drawer at once (#606): the fuel's card reads "Saving…"
 * from the write itself, then the server's price (patched from the answer) or,
 * if refused, the reason. The answer's current price and history row go into
 * the cache before the background refresh.
 */
export const ChangePriceDrawer: React.FC<{
  stationId: string;
  timeZone: string;
  fuels: FuelPriceRow[];
  initial: FuelPriceRow;
  /**
   * An attempt whose outcome is unknown (#606 review): the drawer reopens on
   * its exact rate and effective time, so saving again sends the same body
   * under the same Idempotency-Key and cannot record the change twice.
   */
  attempt?: FuelPriceAttempt | null;
  onClose: () => void;
}> = ({ stationId, timeZone, fuels, initial, attempt, onClose }) => {
  const toast = useToast();
  const refresh = useRefreshTask();
  const qc = useQueryClient();
  const record = useRecordFuelPrice();
  // Mounted per open: one session per price change.
  const save = useKeyedSave(`setup:pricing:${stationId}`);
  const [productId, setProductId] = useState(attempt?.productId ?? initial.productId);
  const [price, setPrice] = useState(attempt ? String(attempt.price) : '');
  // Computed once on open, so a re-render never fights the operator's edit.
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    stationDateTimeInput(
      attempt?.effectiveFrom ? new Date(attempt.effectiveFrom) : new Date(),
      timeZone,
    ),
  );
  const fuel = fuels.find((f) => f.productId === productId) ?? initial;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !price) return;
    const payload = {
      stationId,
      productId,
      price: parseFloat(price),
      effectiveFrom: stationInputToIso(effectiveFrom, timeZone),
    };
    onClose();
    save(payload, (idempotencyKey) => record.mutateAsync({ payload, idempotencyKey })).then(
      () => {
        // The card updating, highlighted, is the confirmation; there is no
        // record of its own to open, so the toast has no action. A change
        // for later is stored but not current until its time (#619).
        const done = isScheduledFuelPrice(payload, Date.now())
          ? 'Fuel rate scheduled.'
          : 'Fuel rate updated.';
        toast.success(done);
        refresh(
          () =>
            Promise.all([
              qc.invalidateQueries(
                { queryKey: queryKeys.pricing(stationId) },
                { throwOnError: true },
              ),
              qc.invalidateQueries(
                { queryKey: queryKeys.pricingHistory(stationId) },
                { throwOnError: true },
              ),
            ]),
          done,
        );
      },
      // Refused or unanswered: the fuel's card says so, with the next step.
      () => undefined,
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
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="change-price-form"
            variant="primary"
            size="md"
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
        <Field
          label="Effective from"
          required
          hint={`Station time (${timeZone}). A later time schedules the change; shifts opened before then keep the current rate.`}
        >
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

/**
 * Set a product's MRP. Mounted per open, so each edit gets its own key session.
 * The answer's price is patched into the product list before the background
 * refresh, so a form waiting on it (a Handover Product Sale line, #638) reads it
 * at once.
 */
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
    let answer: { id: string; sellingPrice?: number | string | null };
    try {
      setSaving(true);
      answer = await save(body, (idempotencyKey) =>
        productService.updateProduct(product.id, body, { idempotencyKey }),
      );
    } catch (err: any) {
      toast.error(
        withNextStep(err.message || "Couldn't update the price", 'Check the MRP and save again.'),
      );
      setSaving(false);
      return;
    }
    patchQueryData<MerchRow[]>(qc, queryKeys.products(), (list) =>
      withProductPrice(list, {
        id: product.id,
        sellingPrice: answer?.sellingPrice ?? body.sellingPrice,
      }),
    );
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
