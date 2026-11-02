/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ProductCategoryField } from './ProductCategoryField.js';

describe('ProductCategoryField', () => {
  afterEach(cleanup);

  it('associates the Category label with the text input via htmlFor and id', () => {
    render(
      <ProductCategoryField value="" onChange={vi.fn()} categories={['Engine Oil', 'Coolant']} />,
    );
    const input = screen.getByLabelText('Category');
    expect(input).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Category' })).toBe(input);
    expect(input.getAttribute('list')).toBeTruthy();
    expect(input.id).toBeTruthy();
  });
});
