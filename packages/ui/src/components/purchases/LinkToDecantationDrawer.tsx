import React from 'react';
import { Drawer } from '../Drawer.js';
import { Button, DataSection, DateText, EmptyState, SectionHeader } from '../../pump-ds/index.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
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
      toast.error(
        withNextStep(
          e instanceof Error ? e.message : "Couldn't link the purchase",
          'Pick the decantation again and link it.',
        ),
      );
    }
  };

  return (
    <Drawer isOpen={!!purchase} onClose={onClose} title="Link to decantation">
      {purchase && (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-ink-muted">
            Invoice {purchase.invoiceNumber || purchase.documentNumber} · {purchase.supplierName}
          </p>
          <DataSection
            title="decantations"
            query={[itemsQ, decantationsQ]}
            enabled
            placeholderHeight={120}
            shape="bare"
          >
            <div className="flex flex-col gap-4">
              {products.map((product) => {
                const rows = candidates(product.id);
                return (
                  <section key={product.id} className="flex flex-col gap-2">
                    <SectionHeader title={product.name} />
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
                          className="flex items-center justify-between gap-3 rounded-input border border-border-soft px-2.5 py-2"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono font-semibold text-ink-strong">
                              {d.documentNumber}
                            </span>
                            <span className="text-[12px] text-ink-muted">
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
              })}
            </div>
          </DataSection>
        </div>
      )}
    </Drawer>
  );
};
