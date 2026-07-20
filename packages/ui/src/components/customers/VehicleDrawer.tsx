import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Drawer } from '../Drawer.js';
import { Field, TextInput, Select } from '../primitives/Field.js';
import { Combobox } from '../primitives/Combobox.js';
import { Checkbox } from '../primitives/Toggle.js';
import { Button } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';

const transactionService = new CloudTransactionService();

interface VehicleDrawerProps {
  isOpen: boolean;
  /** null = create, object = edit. */
  editingVehicle: any | null;
  /** Pre-selected customer when creating. */
  defaultCustomerId: string;
  /** Credit/Fleet customers eligible to own vehicles. */
  eligibleCustomers: any[];
  /** Active fuel products for the default-product picker. */
  fuelProducts: any[];
  onClose: () => void;
  /** Fired with the newly-created (enriched) vehicle in create mode, e.g. to auto-select it. */
  onCreated?: (vehicle: any) => void;
}

/**
 * Add / edit a customer vehicle. Self-contained: owns its form state, resets on
 * open, and performs the save + `['vehicles']` cache invalidation + toast.
 */
export const VehicleDrawer: React.FC<VehicleDrawerProps> = ({ isOpen, editingVehicle, defaultCustomerId, eligibleCustomers, fuelProducts, onClose, onCreated }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    registrationNumber: '',
    vehicleType: '',
    defaultProductId: '',
    isActive: true,
  });

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingVehicle) {
      setForm({
        customerId: editingVehicle.customerId,
        registrationNumber: editingVehicle.registrationNumber || '',
        vehicleType: editingVehicle.vehicleType || '',
        defaultProductId: editingVehicle.defaultProductId || '',
        isActive: editingVehicle.isActive,
      });
    } else {
      setForm({ customerId: defaultCustomerId, registrationNumber: '', vehicleType: '', defaultProductId: '', isActive: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingVehicle, defaultCustomerId]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.customerId || !form.registrationNumber || !form.vehicleType) {
      setError('Customer, registration number and vehicle type are required.');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        registrationNumber: form.registrationNumber.trim().toUpperCase(),
        vehicleType: form.vehicleType.trim(),
        defaultProductId: form.defaultProductId || null,
        isActive: form.isActive,
      };
      if (editingVehicle) {
        await transactionService.updateCustomerVehicle(editingVehicle.id, payload);
      } else {
        const created = await transactionService.createCustomerVehicle(form.customerId, payload);
        const cust = eligibleCustomers.find((c: any) => c.id === form.customerId);
        const prod = fuelProducts.find((p: any) => p.id === form.defaultProductId);
        onCreated?.({
          ...created,
          customerId: form.customerId,
          customerName: cust?.name ?? null,
          customerType: cust?.customerType ?? null,
          registrationNumber: payload.registrationNumber,
          defaultProductId: payload.defaultProductId,
          defaultProductName: prod?.name ?? null,
        });
      }
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success(editingVehicle ? 'Vehicle updated.' : 'Vehicle added.');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}>
      <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {error && (
          <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
            {error}
          </div>
        )}

        {!editingVehicle && (
          <Field label="Customer" required>
            <Combobox
              options={eligibleCustomers.map((c: any) => ({ value: c.id, label: `${c.name} (${c.customerType})` }))}
              value={form.customerId}
              onChange={(value) => setForm((prev) => ({ ...prev, customerId: value }))}
              placeholder="Select customer…"
              searchPlaceholder="Search customers…"
            />
          </Field>
        )}

        <Field label="Registration Number" required>
          <TextInput
            value={form.registrationNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, registrationNumber: e.target.value.toUpperCase() }))}
            disabled={submitting}
            placeholder="e.g. KL07AB1234"
          />
        </Field>

        <Field label="Vehicle Type" required>
          <TextInput
            value={form.vehicleType}
            onChange={(e) => setForm((prev) => ({ ...prev, vehicleType: e.target.value }))}
            disabled={submitting}
            placeholder="e.g. Truck, Bus"
          />
        </Field>

        <Field label="Default Fuel Product">
          <Select
            value={form.defaultProductId}
            onChange={(e) => setForm((prev) => ({ ...prev, defaultProductId: e.target.value }))}
            disabled={submitting}
          >
            <option value="">-- Select Product --</option>
            {fuelProducts.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </Select>
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Checkbox
            label="Vehicle Active"
            checked={form.isActive}
            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            disabled={submitting}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <Button type="submit" variant="primary" fullWidth loading={submitting}>Save Vehicle</Button>
          <Button type="button" variant="secondary" fullWidth disabled={submitting} onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  );
};
