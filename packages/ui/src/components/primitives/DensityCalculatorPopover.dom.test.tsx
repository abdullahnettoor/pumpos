// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DensityCalculatorPopover } from './DensityCalculatorPopover.js';

afterEach(cleanup);

describe('DensityCalculatorPopover', () => {
  it('renders trigger button and is accessible', () => {
    render(<DensityCalculatorPopover onApply={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /calculate density/i });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens dialog on trigger click and closes on Esc', () => {
    render(<DensityCalculatorPopover onApply={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /calculate density/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: /density calculator/i })).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /density calculator/i })).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('computes live 15 °C density for worked example (828.0 kg/m³ @ 32 °C → 840.10)', () => {
    const onApply = vi.fn();
    render(<DensityCalculatorPopover onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /calculate density/i }));

    const densityInput = screen.getByLabelText(/observed density/i);
    const tempInput = screen.getByLabelText(/temperature/i);

    fireEvent.change(densityInput, { target: { value: '828.0' } });
    fireEvent.change(tempInput, { target: { value: '32.0' } });

    // Live display should show 840.10 kg/m³ and VCF ~0.9856
    expect(screen.getByText(/840.10 kg\/m³/)).toBeTruthy();
    expect(screen.getByText(/0.9856/)).toBeTruthy();

    const applyBtn = screen.getByRole('button', { name: /apply/i });
    expect(applyBtn).toBeTruthy();
    expect((applyBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(applyBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    const [density15, observed, tempC] = onApply.mock.calls[0];
    expect(Math.round(density15 * 10) / 10).toBe(840.1);
    expect(observed).toBe(828.0);
    expect(tempC).toBe(32.0);

    // Dialog should be closed after apply
    expect(screen.queryByRole('dialog', { name: /density calculator/i })).toBeNull();
  });

  it('evaluates tolerance against invoice density', () => {
    render(
      <DensityCalculatorPopover
        onApply={vi.fn()}
        invoiceDensity={842.0}
        tolerance={3}
        initialObserved={828.0}
        initialTempC={32.0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /calculate density/i }));

    // Deviation: 840.10 - 842.0 = -1.90 kg/m³ (within ±3)
    expect(screen.getByText(/-1.9/)).toBeTruthy();
    expect(screen.getByText(/within tolerance/i)).toBeTruthy();
  });

  it('warns when calculated density is outside tolerance of invoice density', () => {
    render(
      <DensityCalculatorPopover
        onApply={vi.fn()}
        invoiceDensity={845.0}
        tolerance={3}
        initialObserved={828.0}
        initialTempC={32.0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /calculate density/i }));

    // Deviation: 840.10 - 845.0 = -4.90 kg/m³ (> 3)
    expect(screen.getByText(/-4.9/)).toBeTruthy();
    expect(screen.getByText(/outside tolerance/i)).toBeTruthy();
  });

  it('clears input values on Clear button click', () => {
    render(
      <DensityCalculatorPopover onApply={vi.fn()} initialObserved={828.0} initialTempC={32.0} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /calculate density/i }));

    expect((screen.getByLabelText(/observed density/i) as HTMLInputElement).value).toBe('828');
    expect((screen.getByLabelText(/temperature/i) as HTMLInputElement).value).toBe('32');

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect((screen.getByLabelText(/observed density/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/temperature/i) as HTMLInputElement).value).toBe('');
  });

  it('supports OMC_TABLE_53B method with glass correction', () => {
    render(
      <DensityCalculatorPopover
        onApply={vi.fn()}
        method="OMC_TABLE_53B"
        initialObserved={828.0}
        initialTempC={32.0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /calculate density/i }));

    // OMC Table 53B glass correction yields ~839.8 kg/m³
    expect(screen.getByText(/839.8/)).toBeTruthy();
  });

  it('disables trigger when disabled prop is true', () => {
    render(<DensityCalculatorPopover onApply={vi.fn()} disabled />);
    const trigger = screen.getByRole('button', { name: /calculate density/i }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);

    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
