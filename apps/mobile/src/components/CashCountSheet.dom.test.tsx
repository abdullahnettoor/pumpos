// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CashBreakdown } from '@pump/ui';
import { BackStackContext, type BackStack } from '../ui/backStack.js';
import { CashCountSheet } from './CashCountSheet.js';

/** The cash counter is a ui/BottomSheet: a modal dialog that traps focus and makes the page inert. */
const back: BackStack = {
  back: () => {},
  registerOverlay: () => () => {},
  registerGuard: () => () => {},
};

const Harness: React.FC<{ onApply?: (t: number) => void; onClose?: () => void }> = ({
  onApply = () => {},
  onClose = () => {},
}) => {
  const [breakdown, setBreakdown] = useState<CashBreakdown>({});
  return (
    <BackStackContext.Provider value={back}>
      <div id="page">
        <button type="button">Count cash</button>
      </div>
      <CashCountSheet
        open
        onClose={onClose}
        breakdown={breakdown}
        onBreakdownChange={setBreakdown}
        onApply={onApply}
        currentValue={0}
      />
    </BackStackContext.Provider>
  );
};

afterEach(cleanup);

describe('CashCountSheet', () => {
  it('is a modal dialog in the body that makes the rest of the page inert', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Cash denomination counter' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('page')?.parentElement?.hasAttribute('inert')).toBe(true);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('sums the counted notes and applies the total', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<Harness onApply={onApply} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Count of ₹500'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Count of ₹50'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply/ }));
    expect(onApply).toHaveBeenCalledWith(2150);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing while closed', () => {
    render(
      <BackStackContext.Provider value={back}>
        <CashCountSheet
          open={false}
          onClose={() => {}}
          breakdown={{}}
          onBreakdownChange={() => {}}
          onApply={() => {}}
        />
      </BackStackContext.Provider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
