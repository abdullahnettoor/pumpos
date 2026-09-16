// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { muteExpectedConsoleErrors } from '../../test/renderWithProviders.js';
import { PurchaseEntryForm, type PurchaseEntryFormProps } from './PurchaseEntryForm.js';

/**
 * Purchases move stock and money, and the form does real work before it
 * submits: it derives a fuel line's ₹/L from the total the operator actually
 * typed, and refuses to submit a fuel line whose tank allocation does not add
 * up to the delivered quantity. Both are asserted through the payload handed to
 * `onSubmit`, which is what a downstream refactor must not change.
 *
 * No providers are needed: the form takes no query hooks, and `AccountSelect`
 * (the only thing that does) renders solely when payment capture is enabled.
 */
const PETROL = { id: 'p-fuel', name: 'Petrol', productType: 'FUEL', unit: 'L' };
const OIL = {
  id: 'p-oil',
  name: 'Engine Oil',
  productType: 'MERCHANDISE',
  unit: 'unit',
  taxCategory: 'GST',
  taxConfig: { gst_rate: 18, cess: 0 },
};

const baseProps = (over: Partial<PurchaseEntryFormProps> = {}): PurchaseEntryFormProps => ({
  shiftOptions: [],
  suppliers: [{ id: 's1', name: 'IOCL Depot', isActive: true }],
  products: [PETROL, OIL],
  tanks: [],
  submitting: false,
  onCancel: vi.fn(),
  onSubmit: vi.fn(),
  ...over,
});

/** The form's labels are not associated with their inputs, so walk from one. */
const inputUnder = (labelText: string | RegExp, index = 0): HTMLInputElement => {
  const label = screen.getAllByText(labelText)[index];
  const input = label.parentElement?.querySelector('input');
  if (!input) throw new Error(`no input under label ${String(labelText)}`);
  return input as HTMLInputElement;
};

const submitForm = () => {
  const form = screen.getByRole('button', { name: 'Add Purchase' }).closest('form');
  fireEvent.submit(form!);
};

describe('PurchaseEntryForm', () => {
  let restoreConsole: () => void;
  beforeEach(() => {
    // Only the noise these tests provoke on purpose; React's act() and
    // unmounted-update warnings must still reach the console.
    restoreConsole = muteExpectedConsoleErrors([
      /not wrapped in act/,
      /Warning: validateDOMNesting/,
    ]);
  });
  afterEach(() => {
    cleanup();
    restoreConsole();
  });

  describe('fuel rate derivation', () => {
    it('submits the ₹/L implied by the total the operator typed, not a typed rate', async () => {
      const onSubmit = vi.fn();
      render(
        <PurchaseEntryForm
          {...baseProps({
            onSubmit,
            defaultValues: {
              supplierId: 's1',
              lines: [{ productId: PETROL.id, quantity: 5000 } as never],
            },
          })}
        />,
      );

      // ₹4,72,500 for 5,000 L = ₹94.50/L
      fireEvent.change(inputUnder('Total Amount (₹)'), { target: { value: '472500' } });
      await waitFor(() => expect(screen.getByText(/Derived: ₹94\.5000/)).toBeDefined());

      submitForm();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      const [values] = onSubmit.mock.calls[0];
      expect(values.lines[0].unitPrice).toBeCloseTo(94.5, 6);
      expect(values.lines[0].quantity).toBe(5000);
    });

    it('re-derives the rate when the quantity changes, keeping the entered total fixed', async () => {
      const onSubmit = vi.fn();
      render(
        <PurchaseEntryForm
          {...baseProps({
            onSubmit,
            defaultValues: {
              supplierId: 's1',
              lines: [{ productId: PETROL.id, quantity: 5000 } as never],
            },
          })}
        />,
      );
      fireEvent.change(inputUnder('Total Amount (₹)'), { target: { value: '472500' } });
      await waitFor(() => expect(screen.getByText(/Derived: ₹94\.5000/)).toBeDefined());

      // A short delivery: same invoice total, fewer litres, so a higher ₹/L.
      fireEvent.change(inputUnder(/^Quantity/), { target: { value: '4500' } });
      await waitFor(() => expect(screen.getByText(/Derived: ₹105\.0000/)).toBeDefined());

      submitForm();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].lines[0].unitPrice).toBeCloseTo(105, 6);
    });

    it('keeps the entered rate for a non-fuel line', async () => {
      const onSubmit = vi.fn();
      render(
        <PurchaseEntryForm
          {...baseProps({
            onSubmit,
            defaultValues: {
              supplierId: 's1',
              lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 } as never],
            },
          })}
        />,
      );
      submitForm();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].lines[0].unitPrice).toBe(450);
    });
  });

  describe('tank allocation', () => {
    const tanks = [
      { id: 't1', name: 'Tank 1', productId: PETROL.id, capacity: 10000 },
      { id: 't2', name: 'Tank 2', productId: PETROL.id, capacity: 10000 },
    ];
    const fuelLine = {
      supplierId: 's1',
      lines: [{ productId: PETROL.id, quantity: 5000 } as never],
    };

    it('refuses to submit when the split does not add up to the delivered quantity', async () => {
      const onSubmit = vi.fn();
      render(<PurchaseEntryForm {...baseProps({ onSubmit, tanks, defaultValues: fuelLine })} />);
      fireEvent.change(inputUnder('Total Amount (₹)'), { target: { value: '472500' } });

      const allocInputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(allocInputs[0], { target: { value: '3000' } });
      fireEvent.change(allocInputs[1], { target: { value: '1000' } }); // 4,000 of 5,000

      submitForm();
      await waitFor(() =>
        expect(screen.getByText(/must equal the line quantity \(5000\.00L\)/)).toBeDefined(),
      );
      // Stock would be wrong, so nothing is sent at all.
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('submits the split once it reconciles to the delivered quantity', async () => {
      const onSubmit = vi.fn();
      render(<PurchaseEntryForm {...baseProps({ onSubmit, tanks, defaultValues: fuelLine })} />);
      fireEvent.change(inputUnder('Total Amount (₹)'), { target: { value: '472500' } });

      const allocInputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(allocInputs[0], { target: { value: '3000' } });
      fireEvent.change(allocInputs[1], { target: { value: '2000' } });

      submitForm();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].lines[0].tankAllocations).toEqual([
        { tankId: 't1', quantity: 3000 },
        { tankId: 't2', quantity: 2000 },
      ]);
    });

    it('omits tanks that received nothing rather than sending a zero', async () => {
      const onSubmit = vi.fn();
      render(<PurchaseEntryForm {...baseProps({ onSubmit, tanks, defaultValues: fuelLine })} />);
      fireEvent.change(inputUnder('Total Amount (₹)'), { target: { value: '472500' } });

      const allocInputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(allocInputs[0], { target: { value: '5000' } });

      submitForm();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].lines[0].tankAllocations).toEqual([
        { tankId: 't1', quantity: 5000 },
      ]);
    });

    it('carries no allocation for a non-fuel line', async () => {
      const onSubmit = vi.fn();
      render(
        <PurchaseEntryForm
          {...baseProps({
            onSubmit,
            tanks,
            defaultValues: {
              supplierId: 's1',
              lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 } as never],
            },
          })}
        />,
      );
      submitForm();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].lines[0].tankAllocations).toBeUndefined();
    });
  });

  describe('tax preview', () => {
    const oilLine = {
      supplierId: 's1',
      lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 } as never],
    };

    it('splits GST into CGST and SGST for an in-state supply', () => {
      render(<PurchaseEntryForm {...baseProps({ defaultValues: oilLine, interState: false })} />);
      expect(screen.getByText('CGST + SGST')).toBeDefined();
      expect(screen.queryByText('IGST')).toBeNull();
    });

    it('charges IGST for an inter-state supply', () => {
      render(<PurchaseEntryForm {...baseProps({ defaultValues: oilLine, interState: true })} />);
      expect(screen.getByText('IGST')).toBeDefined();
      expect(screen.queryByText('CGST + SGST')).toBeNull();
    });

    it('adds tax on top of the taxable value for the invoice total', () => {
      render(<PurchaseEntryForm {...baseProps({ defaultValues: oilLine })} />);
      // 10 × ₹450 = ₹4,500 taxable, 18% GST = ₹810, invoice ₹5,310.
      expect(screen.getAllByText(/4,500/).length).toBeGreaterThan(0);
      expect(screen.getByText(/810/)).toBeDefined();
      expect(screen.getByText(/5,310/)).toBeDefined();
    });

    it('adds no client-side tax to fuel, which is recorded tax-inclusive', async () => {
      render(
        <PurchaseEntryForm
          {...baseProps({
            defaultValues: {
              supplierId: 's1',
              lines: [{ productId: PETROL.id, quantity: 100 } as never],
            },
          })}
        />,
      );
      fireEvent.change(inputUnder('Total Amount (₹)'), { target: { value: '9450' } });
      await waitFor(() => expect(screen.getAllByText(/9,450/).length).toBeGreaterThan(0));
    });
  });

  describe('validation', () => {
    it('does not submit without a supplier', async () => {
      const onSubmit = vi.fn();
      render(
        <PurchaseEntryForm
          {...baseProps({
            onSubmit,
            defaultValues: { lines: [{ productId: OIL.id, quantity: 1, unitPrice: 10 } as never] },
          })}
        />,
      );
      submitForm();
      await waitFor(() => expect(screen.getByText('Supplier is required')).toBeDefined());
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit a line with no product', async () => {
      const onSubmit = vi.fn();
      render(
        <PurchaseEntryForm {...baseProps({ onSubmit, defaultValues: { supplierId: 's1' } })} />,
      );
      submitForm();
      await waitFor(() => expect(screen.getByText('Product is required')).toBeDefined());
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('payment capture', () => {
    const oilLine = {
      supplierId: 's1',
      lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 } as never],
    };

    it('sends no payment when capture is disabled', async () => {
      const onSubmit = vi.fn();
      render(<PurchaseEntryForm {...baseProps({ onSubmit, defaultValues: oilLine })} />);
      submitForm();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][1]).toBeUndefined();
    });
  });

  describe('reopening for a different purchase', () => {
    // Guards the effect that resets the form when `defaultValues` changes. A
    // "fix" that runs it only on mount would show the previous purchase's
    // quantities against the new supplier — invisible without this.
    const tanks = [{ id: 't1', name: 'Tank 1', productId: PETROL.id, capacity: 10000 }];

    it('shows the new purchase, not the previous one', async () => {
      const { rerender } = render(
        <PurchaseEntryForm
          {...baseProps({
            defaultValues: {
              supplierId: 's1',
              invoiceNumber: 'INV-001',
              lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 } as never],
            },
          })}
        />,
      );
      expect((inputUnder(/Quantity/) as HTMLInputElement).value).toBe('10');

      rerender(
        <PurchaseEntryForm
          {...baseProps({
            defaultValues: {
              supplierId: 's1',
              invoiceNumber: 'INV-002',
              lines: [{ productId: OIL.id, quantity: 25, unitPrice: 500 } as never],
            },
          })}
        />,
      );
      await waitFor(() => expect((inputUnder(/Quantity/) as HTMLInputElement).value).toBe('25'));
    });

    it('discards what was typed against the previous purchase', async () => {
      const { rerender } = render(
        <PurchaseEntryForm
          {...baseProps({
            tanks,
            defaultValues: {
              supplierId: 's1',
              lines: [{ productId: PETROL.id, quantity: 5000 } as never],
            },
          })}
        />,
      );
      fireEvent.change(inputUnder('Total Amount (₹)'), { target: { value: '472500' } });
      fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '5000' } });

      rerender(
        <PurchaseEntryForm
          {...baseProps({
            tanks,
            defaultValues: {
              supplierId: 's1',
              lines: [{ productId: PETROL.id, quantity: 3000 } as never],
            },
          })}
        />,
      );

      // Carrying either figure over would book the wrong litres into the tank.
      await waitFor(() =>
        expect((inputUnder('Total Amount (₹)') as HTMLInputElement).value).toBe(''),
      );
      expect((inputUnder(/Quantity/) as HTMLInputElement).value).toBe('3000');
      // The split now reflects the new delivery, not the old 5,000 L.
      expect((screen.getAllByPlaceholderText('0.00')[0] as HTMLInputElement).value).toBe('3000');
    });

    it('auto-allocates a single-tank line once the quantity is edited', async () => {
      // NOTE: this deliberately edits the quantity rather than relying on mount.
      // With `defaultValues` supplied, the reset effect regenerates the field
      // ids *after* the auto-allocation effect has keyed its entry to the old
      // ones, so the mount-time allocation is silently dropped. Filed
      // separately; this pins the path that does work.
      const onSubmit = vi.fn();
      render(
        <PurchaseEntryForm
          {...baseProps({
            onSubmit,
            tanks,
            defaultValues: {
              supplierId: 's1',
              lines: [{ productId: PETROL.id, quantity: 5000 } as never],
            },
          })}
        />,
      );
      fireEvent.change(inputUnder('Total Amount (₹)'), { target: { value: '396900' } });
      fireEvent.change(inputUnder(/Quantity/), { target: { value: '4200' } });

      await waitFor(() =>
        expect((screen.getAllByPlaceholderText('0.00')[0] as HTMLInputElement).value).toBe('4200'),
      );

      submitForm();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].lines[0].tankAllocations).toEqual([
        { tankId: 't1', quantity: 4200 },
      ]);
    });
  });
});
