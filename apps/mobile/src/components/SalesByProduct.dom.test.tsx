// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SalesByProduct } from './SalesByProduct.js';

afterEach(cleanup);

const fuel = [
  { key: 'ms', name: 'Petrol', code: 'MS', quantity: 1060, unit: 'L', value: 109095 },
  { key: 'hsd', name: 'Diesel', code: 'HSD', quantity: 1120, unit: 'L', value: 100330 },
];
const products = [
  { key: 'm1', name: 'Engine oil', productType: 'LUBRICANT', quantity: 12, value: 4000 },
  { key: 'm3', name: 'Grease', productType: 'LUBRICANT', quantity: 2, value: 920 },
  { key: 'm2', name: 'Booster', productType: 'ADDITIVE', quantity: 1, value: 1140 },
];

describe('SalesByProduct', () => {
  it('shows the total, a line per grade and per product, and the group labels it is given', () => {
    render(
      <SalesByProduct
        fuel={fuel}
        products={products}
        fuelNote={{ text: 'Shift 1 · closed' }}
        productsNote={{ text: 'Live', live: true }}
      />,
    );
    expect(screen.getByText('₹2,15,485')).toBeTruthy(); // fuel + products
    expect(screen.getByText('Shift 1 · closed')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('Lubes & others')).toBeTruthy();
    expect(screen.getByText('1,060 L')).toBeTruthy();
    // One row per category (units + value), not per product.
    expect(screen.getByText('Lubricants')).toBeTruthy();
    expect(screen.getByText('14 units')).toBeTruthy();
    expect(screen.getByText('₹4,920')).toBeTruthy();
    expect(screen.getByText('Additives')).toBeTruthy();
    expect(screen.getByText('1 unit')).toBeTruthy();
    expect(screen.queryByText('Engine oil')).toBeNull();
    const total = screen.getByText('Products total').parentElement!;
    expect(within(total).getByText('15 units')).toBeTruthy();
    expect(within(total).getByText('₹6,060')).toBeTruthy();
  });

  it('shows one Products line when the lines carry no category (an older snapshot)', () => {
    render(
      <SalesByProduct
        fuel={fuel}
        products={[
          { key: 'm1', name: 'Engine oil', quantity: 14, value: 4920 },
          { key: 'm2', name: 'Coolant', quantity: 1, value: 1140 },
        ]}
        fuelNote={{ text: 'x' }}
        productsNote={{ text: 'y' }}
      />,
    );
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('15 units')).toBeTruthy();
    expect(screen.getByText('₹6,060')).toBeTruthy();
    expect(screen.queryByText('Products total')).toBeNull();
    expect(screen.queryByText('Engine oil')).toBeNull();
    // Fuel per grade is unchanged.
    expect(screen.getByText('1,060 L')).toBeTruthy();
  });

  it('files a line without a category under Other beside categorised ones', () => {
    render(
      <SalesByProduct
        fuel={[]}
        products={[
          { key: 'a', name: 'Oil', productType: 'LUBRICANT', quantity: 1, value: 500 },
          { key: 'b', name: 'Old', quantity: 2, value: 70 },
        ]}
        fuelNote={{ text: 'x' }}
        productsNote={{ text: 'y' }}
      />,
    );
    expect(screen.getByText('Lubricants')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.getByText('Products total')).toBeTruthy();
  });

  it('lets the caller word the empty states (a closed Shift with no product sales)', () => {
    render(
      <SalesByProduct
        fuel={[]}
        products={[]}
        fuelNote={{ text: 'x' }}
        productsNote={{ text: 'y' }}
        fuelEmpty="No fuel sales in this shift."
        productsEmpty="No product sales in this shift."
      />,
    );
    expect(screen.getByText('No fuel sales in this shift.')).toBeTruthy();
    expect(screen.getByText('No product sales in this shift.')).toBeTruthy();
  });

  it('lets the caller retitle the products group and pin the totals', () => {
    render(
      <SalesByProduct
        fuel={[]}
        products={[]}
        fuelNote={{ text: 'From nozzle readings' }}
        productsNote={{ text: 'Product sales' }}
        productsTitle="Products"
        fuelTotal={1000}
        productsTotal={500}
      />,
    );
    expect(screen.getByText('₹1,500')).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('From nozzle readings')).toBeTruthy();
    expect(screen.getByText('Fuel appears once a Shift closes.')).toBeTruthy();
    expect(screen.getByText('No product sales yet.')).toBeTruthy();
  });
});
