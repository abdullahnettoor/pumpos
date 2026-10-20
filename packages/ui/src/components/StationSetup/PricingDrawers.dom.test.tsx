// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { createTestQueryClient, renderWithProviders } from '../../test/renderWithProviders.js';

/**
 * The MRP drawer patches the product list from the server's answer only
 * (#638 review): a returned null is kept, an answer without the price patches
 * nothing, and the typed value is never written.
 */
const updateProduct = vi.fn();
const listProducts = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const ProductBase = actual.CloudProductService as new () => object;
  return {
    ...actual,
    CloudProductService: class extends ProductBase {
      updateProduct = (...a: unknown[]) => updateProduct(...a);
      listProducts = (...a: unknown[]) => listProducts(...a);
    },
  };
});

const { MrpDrawer } = await import('./PricingDrawers.js');
const { queryKeys } = await import('../../query/hooks.js');

type Row = { id: string; name: string; sellingPrice: number | string | null };
const coolant: Row = { id: 'p-cool', name: 'Coolant', sellingPrice: 120 };

const mount = () => {
  const client = createTestQueryClient();
  client.setQueryData<Row[]>(queryKeys.products(), [coolant]);
  const onClose = vi.fn();
  renderWithProviders(<MrpDrawer product={coolant} onClose={onClose} />, { queryClient: client });
  return { client, onClose };
};

/** Types 150 and saves. */
const save150 = () => {
  fireEvent.change(screen.getByPlaceholderText('e.g. 250'), { target: { value: '150' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save price' }));
};

const cachedPrice = (client: ReturnType<typeof createTestQueryClient>) =>
  client.getQueryData<Row[]>(queryKeys.products())?.[0].sellingPrice;

beforeEach(() => {
  updateProduct.mockReset();
  // The background refresh never answers, so the cache shows only the patch.
  listProducts.mockReset().mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

describe('MrpDrawer — patching from the answer (#638)', () => {
  it('writes the answered price', async () => {
    updateProduct.mockResolvedValue({ id: 'p-cool', sellingPrice: '150.00' });
    const { client, onClose } = mount();
    save150();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(cachedPrice(client)).toBe('150.00');
  });

  it('keeps a null the server returns, not the typed 150', async () => {
    updateProduct.mockResolvedValue({ id: 'p-cool', sellingPrice: null });
    const { client, onClose } = mount();
    save150();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(cachedPrice(client)).toBeNull();
  });

  it('patches nothing when the answer omits the price', async () => {
    updateProduct.mockResolvedValue({ id: 'p-cool' });
    const { client, onClose } = mount();
    save150();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(cachedPrice(client)).toBe(120);
  });
});
