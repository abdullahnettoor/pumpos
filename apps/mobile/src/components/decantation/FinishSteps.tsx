import React from 'react';
import { formatQuantity } from '@pump/ui';
import { nowTime, type Visit } from '../../lib/decantation/useVisit.js';
import { StatusBadge } from '../../ui/index.js';
import { Check, NumberField, TimeField, Warn } from './fields.js';

/** Finish step: when unloading ended and which chambers came out empty. */
export const UnloadEndStep: React.FC<{ visit: Visit }> = ({ visit: v }) => (
  <>
    <TimeField
      label="End time"
      value={v.values.unloadEnd}
      onChange={(x) => v.patch({ unloadEnd: x })}
    />
    {v.values.checkChambers && (
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold text-text-muted">Chambers emptied</p>
        <div className="grid grid-cols-2 gap-2">
          {v.values.chambers.map((c, i) => (
            <Check
              key={i}
              checked={c.emptied}
              onChange={(b) => v.setChamber(i, { emptied: b })}
              title={`Chamber ${i + 1}`}
            />
          ))}
        </div>
      </div>
    )}
  </>
);

/** Optional after dip per tank line; without one the next Tank Dip measures it. */
export const AfterDipStep: React.FC<{ visit: Visit }> = ({ visit: v }) => (
  <>
    {v.values.lines.map((l, i) => {
      const tank = v.tanks.find((t) => t.id === l.tankId);
      const name = tank ? `${tank.name} · ${tank.productName}` : `Tank ${i + 1}`;
      return (
        <div key={l.id ?? i} className="flex flex-col gap-2.5 rounded-xl border border-line p-3">
          <span className="text-[12.5px] font-bold text-text-high">{name}</span>
          <p className="num text-[12px] text-text-muted">
            Before dip {formatQuantity(Number(l.beforeDip), 'L')}
          </p>
          <Check
            checked={l.doAfterDip}
            onChange={(b) =>
              v.setLine(i, {
                doAfterDip: b,
                afterDipTime: b && !l.afterDipTime ? nowTime(v.timeZone) : l.afterDipTime,
              })
            }
            title={`Take after-unloading dip now (${tank?.name ?? `tank ${i + 1}`})`}
            sub="Optional: otherwise the next Tank Dip measures it"
          />
          {l.doAfterDip && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField
                  label="After dip (L)"
                  ariaLabel={`After dip (L) tank ${i + 1}`}
                  value={l.afterDip}
                  onChange={(x) => v.setLine(i, { afterDip: x })}
                />
                <NumberField
                  label="Sales during (L)"
                  ariaLabel={`Sales during (L) tank ${i + 1}`}
                  value={l.salesDuring}
                  onChange={(x) => v.setLine(i, { salesDuring: x })}
                />
              </div>
              <TimeField
                label="After dip time"
                value={l.afterDipTime}
                onChange={(x) => v.setLine(i, { afterDipTime: x })}
              />
            </>
          )}
        </div>
      );
    })}
  </>
);

/** Per-invoice variance and per-tank stock; every flag is a note, never a stop. */
export const ReviewStep: React.FC<{ visit: Visit }> = ({ visit: v }) => {
  const productName = (id: string) => v.fuelProducts.find((p) => p.id === id)?.name ?? 'Fuel';
  return (
    <div className="flex flex-col gap-2">
      {v.review.invoices.map((x) => (
        <div
          key={x.productId}
          className="flex items-center justify-between rounded-xl border border-line p-3"
        >
          <span className="min-w-0">
            <span className="block text-[12.5px] font-bold text-text-high">
              {productName(x.productId)} invoice
            </span>
            <span className="num block text-[12px] text-text-muted">
              Invoice {formatQuantity(x.invoiceQty, 'L')} · received{' '}
              {formatQuantity(x.received, 'L')}
            </span>
          </span>
          {x.variance == null ? (
            <StatusBadge tone="info">Pending</StatusBadge>
          ) : (
            <StatusBadge tone={x.outOfTolerance ? 'bad' : 'good'} num>
              {x.variance < 0 ? 'Short' : 'Excess'}{' '}
              {formatQuantity(x.variance, 'L', { plus: true })}
            </StatusBadge>
          )}
        </div>
      ))}
      {v.review.lines.map((l) => (
        <div
          key={l.index}
          className="flex items-center justify-between rounded-xl border border-line p-3"
        >
          <span className="text-[12.5px] font-bold text-text-high">
            {v.tanks.find((t) => t.id === l.tankId)?.name ?? `Tank ${l.index + 1}`}
          </span>
          {l.received == null ? (
            <StatusBadge tone="info">Pending measurement</StatusBadge>
          ) : (
            <span className="num text-[12.5px] font-semibold text-text-high">
              +{formatQuantity(l.received, 'L')} received
            </span>
          )}
        </div>
      ))}
      {v.review.unlinkedProductIds.map((p) => (
        <Warn key={p}>{productName(p)}: purchase not linked. Variance waits for the invoice.</Warn>
      ))}
      {v.flags.flags.map((f, i) => (
        <Warn key={i} tone="bad">
          {f.message} It will be flagged.
        </Warn>
      ))}
    </div>
  );
};
