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
  { key: 'm1', name: 'Engine oil', quantity: 14, value: 4920 },
  { key: 'm2', name: 'Coolant', quantity: 1, value: 1140 },
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
    expect(screen.getByText('14 units')).toBeTruthy();
    expect(screen.getByText('1 unit')).toBeTruthy();
    const total = screen.getByText('Products total').parentElement!;
    expect(within(total).getByText('15 units')).toBeTruthy();
    expect(within(total).getByText('₹6,060')).toBeTruthy();
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
