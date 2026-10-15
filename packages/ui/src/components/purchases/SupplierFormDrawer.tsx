import React, { useState } from 'react';
import { resolveEntryDate } from '@pump/shared';
import { Drawer } from '../Drawer.js';
import { Field, TextInput, Textarea } from '../primitives/Field.js';
import { Checkbox } from '../primitives/Toggle.js';
import { Button, DatePickerButton, Form } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useInvalidateOperational, useStationTimeZone } from '../../query/hooks.js';
import { useToast } from '../primitives/ToastProvider.js';

const transactionService = new CloudTransactionService();

interface SupplierFormDrawerProps {
  isOpen: boolean;
  /** null = create, object = edit. */
  editingSupplier: any | null;
  stationId: string | null;
  onClose: () => void;
}

/** Create / edit a supplier. Self-contained: owns its form + save + toast. */
export const SupplierFormDrawer: React.FC<SupplierFormDrawerProps> = ({
  isOpen,
  onClose,
  ...rest
}) => (
  <Drawer
    isOpen={isOpen}
    onClose={onClose}
    title={rest.editingSupplier ? 'Edit supplier' : 'Add supplier'}
  >
    {/*
     * `Drawer` renders nothing while closed, so the form below unmounts on close
     * and is rebuilt from props on open — no reset-on-open effect needed. The key
     * covers what unmounting does not: switching supplier while the drawer stays open.
     */}
    <SupplierForm key={rest.editingSupplier?.id ?? 'new'} onClose={onClose} {...rest} />
  </Drawer>
);

const SupplierForm: React.FC<Omit<SupplierFormDrawerProps, 'isOpen'>> = ({
  editingSupplier,
  stationId,
  onClose,
}) => {
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  const [name, setName] = useState(() => editingSupplier?.name || '');
  const [phone, setPhone] = useState(() => editingSupplier?.phone || '');
  const [isActive, setIsActive] = useState(() =>
    editingSupplier ? editingSupplier.isActive : true,
  );
  const [gstin, setGstin] = useState(() => editingSupplier?.metadata?.gstin || '');
  const [pan, setPan] = useState(() => editingSupplier?.metadata?.pan || '');
  const [tradeName, setTradeName] = useState(() => editingSupplier?.metadata?.tradeName || '');
  const [billingAddress, setBillingAddress] = useState(
    () => editingSupplier?.metadata?.billingAddress || '',
  );
  const [openingDue, setOpeningDue] = useState('');
  const [openingAsOf, setOpeningAsOf] = useState('');
  // An opening balance is dated by the station's calendar (Entry Date, ADR
  // 0005), never this device's.
  const timeZone = useStationTimeZone(stationId);
  const today = resolveEntryDate({ timeZone });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        name: name.trim(),
        phone: phone || null,
        isActive,
        metadata: {
          gstin: gstin || null,
          pan: pan || null,
          tradeName: tradeName || null,
          billingAddress: billingAddress || null,
        },
      };
      if (editingSupplier) {
        await transactionService.updateSupplier(editingSupplier.id, payload);
      } else {
        await transactionService.createSupplier({
          ...payload,
          ...(Number(openingDue) > 0
            ? {
                openingDue: Number(openingDue),
                openingAsOf: openingAsOf || undefined,
                openingStationId: stationId || undefined,
              }
            : {}),
        });
      }
      toast.success(editingSupplier ? 'Supplier updated.' : 'Supplier created.');
      await invalidateOperational(stationId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save supplier');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <div
          role="alert"
          className="rounded-input border border-border-soft bg-danger-bg px-3 py-2 text-[12px] text-danger-fg"
        >
          {error}
        </div>
      )}

      <Field label="Supplier name" required>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          placeholder="e.g. IOCL, HPCL Depot"
        />
      </Field>

      <Field label="Phone number">
        <TextInput
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={submitting}
          placeholder="e.g. +91 9900…"
        />
      </Field>

      <div
        role="group"
        aria-labelledby="supplier-gst-heading"
        className="flex flex-col border-t border-border-soft pt-3"
      >
        <h4 id="supplier-gst-heading" className="mb-3 text-[12px] font-semibold text-ink-strong">
          GST &amp; tax registration (optional, B2B)
        </h4>

        <div className="grid grid-cols-2 gap-x-3">
          <Field label="GSTIN">
            <TextInput
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              disabled={submitting}
              placeholder="15-digit GSTIN"
            />
          </Field>
          <Field label="PAN">
            <TextInput
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              disabled={submitting}
              placeholder="10-digit PAN"
            />
          </Field>
        </div>

        <Field label="Trade name">
          <TextInput
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
            disabled={submitting}
            placeholder="Business trade name"
          />
        </Field>

        <Field label="Billing address">
          <Textarea
            rows={2}
            value={billingAddress}
            onChange={(e) => setBillingAddress(e.target.value)}
            disabled={submitting}
            placeholder="Full billing address"
          />
        </Field>
      </div>

      {!editingSupplier && (
        <div
          role="group"
          aria-labelledby="supplier-opening-heading"
          className="flex flex-col border-t border-border-soft pt-3"
        >
          <h4
            id="supplier-opening-heading"
            className="mb-1 text-[12px] font-semibold text-ink-strong"
          >
            Opening balance (optional)
          </h4>
          <p className="mb-3 text-[12px] text-ink-muted">
            Amount already owed to this supplier before PumpOS. Recorded as an opening payable (not
            a purchase), so it counts toward their balance but stays out of purchases &amp; P&amp;L.{' '}
            <strong className="text-ink-default">Enter carefully: it can’t be edited later</strong>{' '}
            (correct it with a ledger adjustment instead).
          </p>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Opening due (₹)">
              <TextInput
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={openingDue}
                onChange={(e) => setOpeningDue(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="As of date" hint="Defaults to today">
              <DatePickerButton
                variant="field"
                aria-label="Opening due as of"
                value={openingAsOf}
                onChange={setOpeningAsOf}
                max={today}
                disabled={submitting}
              />
            </Field>
          </div>
        </div>
      )}

      <Checkbox
        label="Supplier active"
        checked={isActive}
        onChange={(e) => setIsActive(e.target.checked)}
        disabled={submitting}
      />

      <div className="mt-2 flex gap-2.5">
        <Button type="submit" variant="primary" fullWidth loading={submitting}>
          Save supplier
        </Button>
        <Button type="button" variant="secondary" fullWidth disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Form>
  );
};
