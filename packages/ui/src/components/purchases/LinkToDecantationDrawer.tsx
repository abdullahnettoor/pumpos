import React from 'react';
import { Drawer } from '../Drawer.js';
import { Button, DateText, EmptyState } from '../../pump-ds/index.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { useToast } from '../primitives/ToastProvider.js';
import type { PurchaseLinkRow } from './columns.js';
import {
  useDecantations,
  useLinkDecantationPurchase,
  usePurchaseItems,
} from '../../query/hooks.js';

interface LinkToDecantationDrawerProps {
  /** The Fuel Purchase being linked; null while closed. */
  purchase: PurchaseLinkRow | null;
  onClose: () => void;
}

/**
 * Link an 'Awaiting decantation' Fuel Purchase to one of the station's
 * Decantations (#469). Lists, per product on the invoice, the Decantations that
 * still have an unlinked line of that product, newest first. Linking never blocks
 * on density or quantity: warnings are shown on the Decantation instead.
 */
export const LinkToDecantationDrawer: React.FC<LinkToDecantationDrawerProps> = ({
  purchase,
  onClose,
}) => {
  const toast = useToast();
  const stationId: string | null = purchase?.stationId ?? null;
  const itemsQ = usePurchaseItems(purchase?.id ?? null);
  const decantationsQ = useDecantations(stationId);
  const link = useLinkDecantationPurchase(stationId);

  const products = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of itemsQ.data ?? [])
      if (!seen.has(i.productId)) seen.set(i.productId, i.productName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [itemsQ.data]);

  const candidates = (productId: string) =>
    [...(decantationsQ.data ?? [])]
      .filter((d) => (d.unlinkedProductIds ?? []).includes(productId))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const doLink = async (decantation: { id: string; documentNumber: string }, productId: string) => {
    if (!purchase) return;
    try {
      await link.mutateAsync({
        decantationId: decantation.id,
        productId,
        purchaseId: purchase.id,
      });
      toast.success(`Linked to decantation ${decantation.documentNumber}.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not link the purchase.');
    }
  };

  return (
    <Drawer isOpen={!!purchase} onClose={onClose} title="Link to decantation">
      {purchase && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Invoice {purchase.invoiceNumber || purchase.documentNumber} · {purchase.supplierName}
          </div>
          {itemsQ.isLoading || decantationsQ.isLoading ? (
            <LoadingSpinner text="Loading decantations…" />
          ) : (
            products.map((product) => {
              const rows = candidates(product.id);
              return (
                <section
                  key={product.id}
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                >
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>{product.name}</h3>
                  {rows.length === 0 ? (
                    <EmptyState
                      compact
                      title="No decantation to link"
                      description={`No decantation at this station has an unlinked ${product.name} line yet.`}
                    />
                  ) : (
                    rows.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          padding: '8px 10px',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {d.documentNumber}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Tanker {d.tankerNumber} · <DateText value={d.businessDate} />
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={link.isPending}
                          onClick={() => doLink(d, product.id)}
                        >
                          Link
                        </Button>
                      </div>
                    ))
                  )}
                </section>
              );
            })
          )}
        </div>
      )}
    </Drawer>
  );
};
