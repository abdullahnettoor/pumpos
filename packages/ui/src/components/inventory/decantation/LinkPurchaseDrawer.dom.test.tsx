/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders.js';

const unlinkDecantationPurchase = vi.fn(async () => ({}));

vi.mock('../../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudTransactionService: class {
    unlinkDecantationPurchase = unlinkDecantationPurchase;
    linkDecantationPurchase = vi.fn();
  },
}));
vi.mock('../../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLinkablePurchases: (_s: string, ids: string[]) =>
    ids.map(() => ({ data: [], isLoading: false })),
}));

const { LinkPurchaseDrawer } = await import('./LinkPurchaseDrawer.js');

afterEach(cleanup);

describe('LinkPurchaseDrawer unlink', () => {
  it('confirms inline, then calls DELETE for the product', async () => {
    const decantation: any = {
      id: 'd-1',
      tankerNumber: 'KL-1',
      lines: [{ productId: 'p-hsd' }],
      links: [{ productId: 'p-hsd', purchaseId: 'pur-1' }],
    };
    renderWithProviders(
      <LinkPurchaseDrawer
        stationId="st-1"
        decantation={decantation}
        productNames={{ 'p-hsd': 'HSD' }}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlink HSD' }));
    expect(unlinkDecantationPurchase).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm unlink' }));
    });
    expect(unlinkDecantationPurchase).toHaveBeenCalledWith('d-1', 'p-hsd');
  });
});
