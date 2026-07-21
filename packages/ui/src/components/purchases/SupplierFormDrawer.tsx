import React, { useEffect, useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Field, TextInput, Textarea } from '../primitives/Field.js';
import { Checkbox } from '../primitives/Toggle.js';
import { Button } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useInvalidateOperational } from '../../query/hooks.js';
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
export const SupplierFormDrawer: React.FC<SupplierFormDrawerProps> = ({ isOpen, editingSupplier, stationId, onClose }) => {
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [openingDue, setOpeningDue] = useState('');
  const [openingAsOf, setOpeningAsOf] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    const meta = editingSupplier?.metadata || {};
    setName(editingSupplier?.name || '');
    setPhone(editingSupplier?.phone || '');
    setIsActive(editingSupplier ? editingSupplier.isActive : true);
    setGstin(meta.gstin || '');
    setPan(meta.pan || '');
    setTradeName(meta.tradeName || '');
    setBillingAddress(meta.billingAddress || '');
    setOpeningDue('');
    setOpeningAsOf('');
  }, [isOpen, editingSupplier]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Name is required'); return; }
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
            ? { openingDue: Number(openingDue), openingAsOf: openingAsOf || undefined, openingStationId: stationId || undefined }
            : {}),
        });
      }
      invalidateOperational(stationId);
      toast.success(editingSupplier ? 'Supplier updated.' : 'Supplier created.');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save supplier');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
            {error}
          </div>
        )}

        <Field label="Supplier Name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} placeholder="e.g. IOCL, HPCL Depot" />
        </Field>

        <Field label="Phone Number">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} disabled={submitting} placeholder="e.g. +91 9900…" />
        </Field>

        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px', marginTop: '4px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 12px' }}>
            GST &amp; Tax Registration (Optional B2B)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Field label="GSTIN">
              <TextInput value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} disabled={submitting} placeholder="15-digit GSTIN" />
            </Field>
            <Field label="PAN">
              <TextInput value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} disabled={submitting} placeholder="10-digit PAN" />
            </Field>
          </div>

          <Field label="Trade Name">
            <TextInput value={tradeName} onChange={(e) => setTradeName(e.target.value)} disabled={submitting} placeholder="Business Trade Name" />
          </Field>

          <Field label="Billing Address">
            <Textarea rows={2} value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} disabled={submitting} placeholder="Full Billing Address" />
          </Field>
        </div>

        {!editingSupplier && (
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px', marginTop: '4px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 4px' }}>
              Opening Balance (Optional)
            </h4>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Amount already owed to this supplier before PumpOS. Recorded as an opening payable (not a purchase), so it counts toward their balance but stays out of purchases &amp; P&amp;L. <strong>Enter carefully — it can’t be edited later</strong> (correct it with a ledger adjustment instead).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Field label="Opening Due (₹)">
                <TextInput type="number" min="0" step="0.01" placeholder="0" value={openingDue} onChange={(e) => setOpeningDue(e.target.value)} disabled={submitting} />
              </Field>
              <Field label="As of Date" hint="Defaults to today">
                <TextInput type="date" max={new Date().toLocaleDateString('en-CA')} value={openingAsOf} onChange={(e) => setOpeningAsOf(e.target.value)} disabled={submitting} />
              </Field>
            </div>
          </div>
        )}

        <div style={{ marginTop: '4px' }}>
          <Checkbox label="Supplier Active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={submitting} />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <Button type="submit" variant="primary" fullWidth loading={submitting}>Save Supplier</Button>
          <Button type="button" variant="secondary" fullWidth disabled={submitting} onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  );
};
