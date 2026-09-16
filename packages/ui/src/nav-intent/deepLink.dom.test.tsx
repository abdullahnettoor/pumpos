import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import {
  publishNavIntent,
  clearNavIntent,
  useNavIntent,
  __resetNavIntentForTests,
} from './store.js';

/**
 * A stand-in for the real list screens, reproducing the shape they all now use:
 * derive from the pending intent during render, fall back to local selection,
 * and clear the intent when the operator does something that supersedes it.
 */
const CustomerScreen: React.FC<{ customers: { id: string; name: string }[] }> = ({ customers }) => {
  const [selectedTab, setSelectedTab] = useState('transactions');
  const [statementId, setStatementId] = useState<string | null>(null);

  const intent = useNavIntent();
  const focusId = intent?.focusCustomerId ?? null;
  const activeTab = focusId ? 'registry' : selectedTab;
  const statement = customers.find((c) => c.id === (focusId ?? statementId)) ?? null;

  return (
    <div>
      <span data-testid="tab">{activeTab}</span>
      <span data-testid="statement">{statement ? statement.name : 'none'}</span>
      <button
        onClick={() => {
          clearNavIntent();
          setStatementId(null);
        }}
      >
        Close statement
      </button>
      <button
        onClick={() => {
          clearNavIntent();
          setSelectedTab('transactions');
        }}
      >
        Transactions tab
      </button>
    </div>
  );
};

const tab = () => screen.getByTestId('tab').textContent;
const statement = () => screen.getByTestId('statement').textContent;

describe('nav intent deep links', () => {
  beforeEach(() => __resetNavIntentForTests());
  afterEach(cleanup);

  it('applies an intent published before the destination mounted', () => {
    // This is the real ordering: navigation publishes, then the screen mounts.
    act(() => publishNavIntent({ focusCustomerId: 'c2' }));
    render(<CustomerScreen customers={[{ id: 'c2', name: 'Acme Transport' }]} />);
    expect(tab()).toBe('registry');
    expect(statement()).toBe('Acme Transport');
  });

  it('resolves the deep link once the customer list finishes loading', () => {
    // The old effect bailed out while the query was loading and relied on
    // re-running when data arrived; if the intent identity survived that
    // boundary the guard swallowed it and the deep link silently did nothing.
    act(() => publishNavIntent({ focusCustomerId: 'c2' }));
    const { rerender } = render(<CustomerScreen customers={[]} />);
    expect(statement()).toBe('none');

    rerender(<CustomerScreen customers={[{ id: 'c2', name: 'Acme Transport' }]} />);
    expect(statement()).toBe('Acme Transport');
    expect(tab()).toBe('registry');
  });

  it('keeps the deep link applied across unrelated re-renders', () => {
    act(() => publishNavIntent({ focusCustomerId: 'c2' }));
    const customers = [{ id: 'c2', name: 'Acme Transport' }];
    const { rerender } = render(<CustomerScreen customers={customers} />);
    rerender(<CustomerScreen customers={[...customers]} />);
    expect(statement()).toBe('Acme Transport');
  });

  it('releases the screen back to local state once the operator dismisses it', () => {
    act(() => publishNavIntent({ focusCustomerId: 'c2' }));
    render(<CustomerScreen customers={[{ id: 'c2', name: 'Acme Transport' }]} />);
    expect(statement()).toBe('Acme Transport');

    act(() => {
      screen.getByText('Close statement').click();
    });
    expect(statement()).toBe('none');
    expect(tab()).toBe('transactions');
  });

  it('honours the same deep link a second time', () => {
    const customers = [{ id: 'c2', name: 'Acme Transport' }];
    act(() => publishNavIntent({ focusCustomerId: 'c2' }));
    render(<CustomerScreen customers={customers} />);
    act(() => {
      screen.getByText('Close statement').click();
    });
    expect(statement()).toBe('none');

    // Navigating to the same customer again must work; the old identity/date
    // guards treated a repeat as already-handled.
    act(() => publishNavIntent({ focusCustomerId: 'c2' }));
    expect(statement()).toBe('Acme Transport');
  });

  it('lets a later navigation supersede a pending intent', () => {
    act(() => publishNavIntent({ focusCustomerId: 'c2' }));
    render(
      <CustomerScreen
        customers={[
          { id: 'c2', name: 'Acme' },
          { id: 'c3', name: 'Beta' },
        ]}
      />,
    );
    expect(statement()).toBe('Acme');
    act(() => publishNavIntent({ focusCustomerId: 'c3' }));
    expect(statement()).toBe('Beta');
  });
});
