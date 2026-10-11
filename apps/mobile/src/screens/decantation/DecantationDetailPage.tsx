import React, { useState } from 'react';
import type { Station } from '@pump/shared';
import {
  isoToLocalTime,
  toDecantationRow,
  useDecantations,
  useLinkablePurchases,
  useLinkDecantationPurchase,
  useToast,
} from '@pump/ui';
import { resolveDecantationSettings } from '@pump/shared';
import { useDecantationNames } from '../../lib/decantation/names.js';
import { fmtLitres, fmtSignedLitres } from '../../lib/decantation/format.js';
import { BottomSheet, DetailPage, StateCard, StatusBadge } from '../../ui/index.js';
import { STATUS_BADGE } from './DecantationsListPage.js';

/**
 * Read-only view of a recorded visit (a finished one is sealed), with the one
 * action that stays open: link the Fuel Purchase of a product later.
 */
export const DecantationDetailPage: React.FC<{ station: Station; decantationId: string }> = ({
  station,
  decantationId,
}) => {
  const q = useDecantations(station.id);
  const names = useDecantationNames(station.id);
  const toast = useToast();
  const link = useLinkDecantationPurchase(station.id);
  const [linking, setLinking] = useState<string | null>(null);
  const d = q.data?.find((x) => x.id === decantationId);
  const productIds = d ? [...new Set(d.lines.map((l) => l.productId))] : [];
  const linkable = useLinkablePurchases(station.id, linking ? [linking] : []);
  const tz = (station.settings as { timezone?: string } | undefined)?.timezone ?? 'Asia/Kolkata';

  if (!d)
    return (
      <DetailPage title="Decantation" subtitle={station.name}>
        <StateCard kind={q.isLoading ? 'loading' : 'empty'}>
          {q.isLoading ? 'Loading…' : 'This Decantation is not available.'}
        </StateCard>
      </DetailPage>
    );

  const row = toDecantationRow(
    d,
    names,
    resolveDecantationSettings(station.settings).quantityTolerance,
  );
  const badge = STATUS_BADGE[d.status];
  const productName = (id: string) => names.products[id] ?? 'Fuel';

  const pick = async (purchaseId: string) => {
    if (!linking) return;
    try {
      await link.mutateAsync({ decantationId: d.id, productId: linking, purchaseId });
      toast.success('Purchase linked.');
      setLinking(null);
    } catch (e) {
      toast.error((e as { message?: string } | null)?.message || 'Could not link the purchase');
    }
  };

  return (
    <DetailPage
      title={d.tankerNumber}
      subtitle={[d.documentNumber, isoToLocalTime(d.unloadStartedAt ?? d.createdAt, tz)].join(
        ' · ',
      )}
      right={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
    >
      <div className="flex flex-col gap-2.5 px-3">
        {d.flags.map((f, i) => (
          <p
            key={i}
            className="rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12px] text-bad-fg"
          >
            {f.message}
          </p>
        ))}
        {row.tanks.map((t) => (
          <div
            key={t.lineId}
            className="flex items-center justify-between rounded-xl border border-line bg-card p-3"
          >
            <span className="min-w-0">
              <span className="block text-[12.5px] font-bold text-text-high">
                {t.tankName} · {t.productName}
              </span>
              <span className="num block text-[12px] text-text-muted">
                Before dip {fmtLitres(t.beforeDip)}
              </span>
            </span>
            {t.receivedQty == null ? (
              <StatusBadge tone="info">Pending measurement</StatusBadge>
            ) : (
              <span className="num text-[12.5px] font-semibold text-text-high">
                +{fmtLitres(t.receivedQty)}
              </span>
            )}
          </div>
        ))}
        {productIds.map((p) => {
          const l = d.links?.find((x) => x.productId === p);
          return (
            <div
              key={p}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-3"
            >
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-text-high">
                  {productName(p)} invoice
                </span>
                <span className="num block truncate text-[12px] text-text-muted">
                  {l
                    ? [l.invoiceNumber, l.supplierName, fmtLitres(l.invoiceQty)]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Purchase not linked'}
                </span>
              </span>
              {l ? (
                l.varianceQty != null ? (
                  <StatusBadge tone="good" num>
                    {fmtSignedLitres(l.varianceQty)}
                  </StatusBadge>
                ) : null
              ) : (
                <button
                  type="button"
                  onClick={() => setLinking(p)}
                  className="rounded-[10px] bg-accent-soft px-3 py-2 text-xs font-bold text-accent"
                >
                  Link purchase
                </button>
              )}
            </div>
          );
        })}
      </div>
      <BottomSheet open={!!linking} onClose={() => setLinking(null)} label="Link purchase">
        <div className="flex flex-col gap-3 px-4">
          <h2 className="m-0 text-base font-extrabold text-text-high">
            Link {linking ? productName(linking) : ''} purchase
          </h2>
          {(linkable[0]?.data ?? []).length === 0 && (
            <p className="m-0 text-[13px] text-text-muted">No Fuel Purchase of this product yet.</p>
          )}
          {(linkable[0]?.data ?? []).map((o) => (
            <button
              key={o.purchaseId}
              type="button"
              disabled={link.isPending}
              onClick={() => void pick(o.purchaseId)}
              className="rounded-xl border border-line p-3 text-left"
            >
              <span className="block text-[13px] font-bold text-text-high">
                {o.invoiceNumber ?? o.documentNumber}
              </span>
              <span className="num block text-[12px] text-text-muted">
                {[o.supplierName, o.entryDate, fmtLitres(o.invoiceQty)].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLinking(null)}
            className="flex h-11 items-center justify-center rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-text-high"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    </DetailPage>
  );
};
