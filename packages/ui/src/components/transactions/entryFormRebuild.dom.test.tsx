// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/react';
import { renderWithProviders, muteExpectedConsoleErrors } from '../../test/renderWithProviders.js';
import { ExpenseEntryForm } from './ExpenseEntryForm.js';
import { CollectionEntryForm } from './CollectionEntryForm.js';

/**
 * These forms used to reset themselves from `defaultValues` in an effect; they
 * now remount on a value-keyed `key`. The observable contract is the same and
 * this pins it: reopening for a different entry must show that entry's values,
 * not the previous one's — the amount field on a money form is the last place a
 * stale figure should survive.
 */
const CATEGORIES = [{ id: 'cat-1', name: 'Fuel Card Fee', isActive: true }];
const CUSTOMERS = [{ id: 'cust-1', name: 'Acme Transport', currentBalance: 5000 }];

const amountField = () => document.querySelector('input[name="amount"]') as HTMLInputElement | null;

describe('entry forms rebuild for a different entry', () => {
  let restoreConsole: () => void;
  beforeEach(() => {
    restoreConsole = muteExpectedConsoleErrors([/not wrapped in act/]);
  });
  afterEach(() => {
    cleanup();
    restoreConsole();
  });

  it('ExpenseEntryForm shows the new amount, not the previous one', () => {
    const props = {
      categories: CATEGORIES,
      submitting: false,
      onCancel: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = renderWithProviders(
      <ExpenseEntryForm {...props} defaultValues={{ amount: 1200 } as never} />,
    );
    expect(amountField()?.value).toBe('1200');

    rerender(<ExpenseEntryForm {...props} defaultValues={{ amount: 450 } as never} />);
    expect(amountField()?.value).toBe('450');
  });

  it('ExpenseEntryForm does not wipe what the operator has typed on an unrelated re-render', () => {
    // The key is value-based on purpose. A caller passing a fresh object
    // literal with the same values re-renders constantly, and an identity-based
    // key would remount on each one — wiping a part-finished entry.
    const props = {
      categories: CATEGORIES,
      submitting: false,
      onCancel: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = renderWithProviders(
      <ExpenseEntryForm {...props} defaultValues={{ amount: 1200 } as never} />,
    );
    fireEvent.change(amountField()!, { target: { value: '1375' } });
    expect(amountField()?.value).toBe('1375');

    rerender(<ExpenseEntryForm {...props} defaultValues={{ amount: 1200 } as never} />);
    expect(amountField()?.value).toBe('1375');
  });

  it('CollectionEntryForm shows the new amount, not the previous one', () => {
    const props = {
      customers: CUSTOMERS,
      submitting: false,
      onCancel: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = renderWithProviders(
      <CollectionEntryForm {...props} defaultValues={{ amount: 2500 } as never} />,
    );
    expect(amountField()?.value).toBe('2500');

    rerender(<CollectionEntryForm {...props} defaultValues={{ amount: 800 } as never} />);
    expect(amountField()?.value).toBe('800');
  });
});
