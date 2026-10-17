// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Chip } from './Chip.js';
import { StatusChip } from './StatusChip.js';
import { VarianceChip } from './VarianceChip.js';

afterEach(cleanup);

const chip = (text: string) => screen.getByText(text).closest('span[class*="rounded-chip"]')!;

describe('StatusChip renders the shared vocabulary (#518)', () => {
  it('reads an inactive party as grey "Inactive"', () => {
    render(<StatusChip status="inactive" />);
    expect(chip('Inactive').className).toContain('text-ink-muted');
  });

  it('reads handover, shift and day states in their canonical words and tones', () => {
    render(
      <>
        <StatusChip status="handover-due" />
        <StatusChip status="shift-closed" />
        <StatusChip status="day-draft" />
        <StatusChip status="over-limit" />
      </>,
    );
    expect(chip('Handover due').className).toContain('text-warning-fg');
    expect(chip('Closed').className).toContain('text-ink-muted');
    expect(chip('Draft').className).toContain('text-warning-fg');
    expect(chip('Over limit').className).toContain('text-danger-fg');
  });

  it('strikes through a voided record', () => {
    render(<StatusChip status="voided" />);
    expect(chip('Voided').className).toContain('line-through');
  });
});

describe('VarianceChip', () => {
  it('reads zero as green "Balanced"', () => {
    render(<VarianceChip amount={0} />);
    expect(chip('Balanced').className).toContain('text-success-fg');
  });

  it('reads a surplus in amber with a plus', () => {
    render(<VarianceChip amount={1200} />);
    expect(chip('+₹1,200.00').className).toContain('text-warning-fg');
  });

  it('reads a shortage in red with a true minus', () => {
    render(<VarianceChip amount={-340} />);
    expect(chip('\u2212₹340.00').className).toContain('text-danger-fg');
  });

  it('reads stock variance in litres', () => {
    render(<VarianceChip amount={-3} kind="stock" />);
    expect(chip('\u22123.00 L').className).toContain('text-danger-fg');
  });
});

describe('solid chips pair each fill with its own text-on token', () => {
  it.each([
    ['danger', 'bg-danger-fg', 'text-on-danger'],
    ['warning', 'bg-warning-fg', 'text-on-warning'],
    ['success', 'bg-success-fg', 'text-on-success'],
    ['info', 'bg-info-fg', 'text-on-info'],
    ['neutral', 'bg-ink-strong', 'text-on-neutral'],
    ['brand', 'bg-brand', 'text-on-brand'],
  ] as const)('%s', (tone, fill, text) => {
    render(
      <Chip variant="solid" tone={tone}>
        x
      </Chip>,
    );
    const cls = chip('x').className.split(/\s+/);
    expect(cls).toContain(fill);
    expect(cls).toContain(text);
    if (tone !== 'brand') expect(cls).not.toContain('text-on-brand');
  });
});
