// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductsFields } from './ProductsFields.js';

afterEach(cleanup);

const mount = (onRowsChange = vi.fn()) => {
  render(
    <ProductsFields
      rows={[{ productId: 'p1', quantity: '2' }]}
      options={[{ value: 'p1', label: 'Engine oil' }]}
      productById={{ p1: { sellingPrice: 250, unit: 'pc' } }}
      nonCash=""
      total={500}
      onRowsChange={onRowsChange}
      onNonCashChange={() => {}}
    />,
  );
  return onRowsChange;
};

describe('Products sold stepper', () => {
  it('centres −, the quantity and + as one group, with the delete button at the row end', () => {
    mount();
    const row = document.querySelector('[data-stepper-row]') as HTMLElement;
    const group = row.querySelector('[data-stepper]') as HTMLElement;
    // Equal side columns put the group on the row's centre line.
    expect(row.className).toMatch(/grid-cols-\[1fr_auto_1fr\]/);
    expect(row.className).toMatch(/items-center/);
    expect(group.className).toMatch(/items-center/);
    expect(group.className).toMatch(/justify-center/);
    const kids = [...group.children] as HTMLElement[];
    expect(kids.map((k) => k.getAttribute('aria-label'))).toEqual([
      'Decrease quantity',
      'Quantity',
      'Increase quantity',
    ]);
    const remove = screen.getByRole('button', { name: 'Remove item' });
    expect(row.lastElementChild).toBe(remove);
    expect(remove.className).toMatch(/justify-self-end/);
  });

  it('keeps the three controls and the delete button the same height, with 44px hit areas', () => {
    mount();
    for (const name of ['Decrease quantity', 'Increase quantity', 'Remove item']) {
      const b = screen.getByRole('button', { name });
      expect(b.className).toMatch(/\bh-9\b/);
      expect(b.className).toMatch(/\bhit-44\b/);
    }
    expect(screen.getByLabelText('Quantity').className).toMatch(/\bh-9\b/);
  });

  it('draws − and + as SVG icons and centres the quantity text', () => {
    mount();
    for (const name of ['Decrease quantity', 'Increase quantity']) {
      const b = screen.getByRole('button', { name });
      expect(b.querySelector('svg')).toBeTruthy();
      expect(b.textContent).toBe('');
    }
    expect(screen.getByLabelText('Quantity').className).toMatch(/text-center/);
  });

  it('still steps the quantity', () => {
    const onRowsChange = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(onRowsChange).toHaveBeenCalledWith([{ productId: 'p1', quantity: '3' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
    expect(onRowsChange).toHaveBeenLastCalledWith([{ productId: 'p1', quantity: '1' }]);
  });
});
