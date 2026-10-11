import React, { useState } from 'react';
import type { DecantationView } from '@pump/shared';
import { Drawer } from '../../Drawer.js';
import { useToast } from '../../primitives/ToastProvider.js';
import { createIdempotencyKey } from '../../../query/handoverMutation.js';
import {
  useLinkDecantationPurchase,
  useLinkablePurchases,
  useUnlinkDecantationPurchase,
} from '../../../query/hooks.js';
import { PurchaseCards } from './PurchaseCards.js';
import { UnlinkButton } from './UnlinkButton.js';

export interface LinkPurchaseDrawerProps {
  stationId: string | null;
  /** The Decantation to link; the drawer is open while it is set. */
  decantation: DecantationView | null;
  productNames: Record<string, string>;
  onClose: () => void;
}

/**
 * Link the Fuel Purchase invoice of each product of a Decantation after the fact
 * (#469). One invoice per product: picking another replaces the link, picking the
 * linked one removes it. The server recomputes density flags and variance.
 */
export const LinkPurchaseDrawer: React.FC<LinkPurchaseDrawerProps> = (props) =>
  props.decantation ? <LinkForm {...props} decantation={props.decantation} /> : null;

const LinkForm: React.FC<LinkPurchaseDrawerProps & { decantation: DecantationView }> = ({
  stationId,
  decantation,
  productNames,
  onClose,
}) => {
  const toast = useToast();
  const link = useLinkDecantationPurchase(stationId);
  const unlink = useUnlinkDecantationPurchase(stationId);
  const productIds = [...new Set(decantation.lines.map((l) => l.productId))];
  const queries = useLinkablePurchases(stationId, productIds);
  const [linked, setLinked] = useState<Record<string, string>>(() =>
    Object.fromEntries((decantation.links ?? []).map((l) => [l.productId, l.purchaseId])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const select = async (productId: string, purchaseId: string) => {
    if (busy) return;
    setBusy(productId);
    setError(null);
    try {
      if (purchaseId) {
        await link.mutateAsync({
          decantationId: decantation.id,
          productId,
          purchaseId,
          idempotencyKey: createIdempotencyKey(),
        });
        toast.success('Purchase linked.');
      } else {
        await unlink.mutateAsync({ decantationId: decantation.id, productId });
        toast.success('Purchase unlinked.');
      }
      setLinked((m) => ({ ...m, [productId]: purchaseId }));
    } catch (err: any) {
      setError(err?.message || 'Could not update the link');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer isOpen onClose={onClose} title={`Link purchase · ${decantation.tankerNumber}`}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Pick the Fuel Purchase invoice for each product on this tanker. Variance and the density
        check update once linked.
      </div>
      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--state-danger-bg)',
            color: 'var(--state-danger-fg)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-input)',
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      )}
      {productIds.map((productId, i) => (
        <div key={productId} style={{ marginBottom: 14 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}
          >
            <span style={{ fontWeight: 600 }}>{productNames[productId] ?? 'Fuel'}</span>
            {linked[productId] && (
              <UnlinkButton
                label={productNames[productId] ?? 'Fuel'}
                busy={busy === productId}
                onConfirm={() => void select(productId, '')}
              />
            )}
          </div>
          <PurchaseCards
            purchases={queries[i]?.data ?? []}
            loading={!!queries[i]?.isLoading}
            selectedId={linked[productId] ?? ''}
            onSelect={(purchaseId) => void select(productId, purchaseId)}
          />
        </div>
      ))}
    </Drawer>
  );
};
