import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import {
  publishNavIntent,
  clearNavIntent,
  useNavIntent,
  getNavIntentState,
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

/**
 * Mirrors InventoryList: the intent carries a transient highlight AND a durable
 * tab choice. The durable half must be committed to local state before the
 * intent is dropped, or clearing snaps the operator back to the previous tab.
 */
const InventoryScreen: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState('tanks');
  const intent = useNavIntent();
  const focusTab = intent?.focusInventoryTab ?? null;
  const activeTab = focusTab ?? selectedTab;
  const highlightId = focusTab ? (intent?.focusInventoryId ?? null) : null;

  React.useEffect(() => {
    if (!focusTab) return;
    const t = setTimeout(() => {
      setSelectedTab(focusTab);
      clearNavIntent();
    }, 4000);
    return () => clearTimeout(t);
  }, [focusTab]);

  return (
    <div>
      <span data-testid="tab">{activeTab}</span>
      <span data-testid="highlight">{highlightId ?? 'none'}</span>
    </div>
  );
};

/**
 * Mirrors ShiftsManagement's `openShiftSummaryId` deep link (dashboard "Last
 * closed shift" card): the intent picks the History sub-tab *and* the shift
 * whose summary opens. Dismissing the summary must leave the operator in
 * History, not bounce them back to Active Shift.
 */
const ShiftsScreen: React.FC = () => {
  const [selectedSubTab, setSelectedSubTab] = useState('today');
  const [viewShiftId, setViewShiftId] = useState<string | null>(null);

  const intent = useNavIntent();
  const intentShiftSummaryId = intent?.openShiftSummaryId ?? null;
  const subTab = intentShiftSummaryId ? 'history' : selectedSubTab;
  const requestedShiftId = intentShiftSummaryId ?? viewShiftId;

  return (
    <div>
      <span data-testid="tab">{subTab}</span>
      <span data-testid="statement">{requestedShiftId ?? 'none'}</span>
      <button
        onClick={() => {
          setSelectedSubTab('history');
          setViewShiftId(null);
          clearNavIntent();
        }}
      >
        Close summary
      </button>
    </div>
  );
};

describe('nav intent deep links', () => {
  beforeEach(() => __resetNavIntentForTests());
  afterEach(cleanup);

  describe('shift summary deep link', () => {
    it('opens the requested shift summary on the History sub-tab', () => {
      act(() => publishNavIntent({ openShiftSummaryId: 'shift-9' }));
      render(<ShiftsScreen />);
      expect(tab()).toBe('history');
      expect(statement()).toBe('shift-9');
    });

    it('stays on History once the summary is dismissed', () => {
      act(() => publishNavIntent({ openShiftSummaryId: 'shift-9' }));
      render(<ShiftsScreen />);
      act(() => {
        screen.getByText('Close summary').click();
      });
      // Clearing the intent without committing the tab would snap the operator
      // back to the Active Shift ('today') sub-tab.
      expect(tab()).toBe('history');
      expect(statement()).toBe('none');
      expect(getNavIntentState().intent).toBeNull();
    });
  });

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

  describe('intents carrying more than one lifetime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps the deep-linked tab after the transient highlight expires', () => {
      act(() => publishNavIntent({ focusInventoryTab: 'items', focusInventoryId: 'tank-3' }));
      render(<InventoryScreen />);
      expect(tab()).toBe('items');
      expect(screen.getByTestId('highlight').textContent).toBe('tank-3');

      // The highlight is transient; the tab is not. Clearing the intent without
      // committing the tab first would snap the operator back to 'tanks'.
      act(() => vi.advanceTimersByTime(4000));
      expect(screen.getByTestId('highlight').textContent).toBe('none');
      expect(tab()).toBe('items');
    });

    it('drops the intent once its durable half has been committed', () => {
      act(() => publishNavIntent({ focusInventoryTab: 'items' }));
      render(<InventoryScreen />);
      act(() => vi.advanceTimersByTime(4000));
      // Left pending, a module-global intent would outlive the screen.
      expect(getNavIntentState().intent).toBeNull();
    });
  });
});
