import React from 'react';
import { StatusChip } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import { Field, NumberInput, TextInput } from '../../primitives/Field.js';
import { KV, LineTag, Notice } from './StepSection.js';
import { formatQuantity } from '../../../utils/format.js';
import { GRID, lineBorder, lineLabel, SummaryCard, type StepProps } from './stepShared.js';

export const AfterStep: React.FC<StepProps> = ({ form, values, tanks, flags, review }) => {
  const { register, formState } = form;
  return (
    <>
      <div className="mb-2.5 text-[12px] text-ink-muted">
        Optional. Skip a tank to leave it pending: the next Tank Dip measures it.
      </div>
      {values.lines.map((l, i) => {
        const early = flags.flags.find(
          (f) => f.code === 'EARLY_AFTER_DIP' && f.tankLineId === String(i),
        );
        const received = review.lines[i]?.received;
        const errs = formState.errors.lines?.[i];
        return (
          <div key={i} className={cn('mb-3 border-l-[3px] pb-0.5 pl-3 pt-1', lineBorder(i))}>
            <div className="mb-1.5 flex items-center gap-4">
              <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
              <label className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  className="accent-brand"
                  aria-label={`Measure line ${i + 1} now`}
                  {...register(`lines.${i}.doAfterDip`)}
                />
                Take after dip now
              </label>
            </div>
            {l.doAfterDip ? (
              <div className={GRID[4]}>
                <Field label="After dip (L)" error={errs?.afterDip?.message}>
                  <NumberInput
                    aria-label={`After dip, line ${i + 1}`}
                    {...register(`lines.${i}.afterDip`)}
                  />
                </Field>
                <Field label="Dip time">
                  <TextInput
                    type="time"
                    aria-label={`After dip time, line ${i + 1}`}
                    {...register(`lines.${i}.afterDipTime`)}
                  />
                </Field>
                <Field label="Sales during (L)" hint="Sold while unloading">
                  <NumberInput
                    aria-label={`Sales during, line ${i + 1}`}
                    {...register(`lines.${i}.salesDuring`)}
                  />
                </Field>
                <Field label="Received">
                  <div className="pt-2 font-semibold tabular-nums">
                    {formatQuantity(received, 'L')}
                  </div>
                </Field>
              </div>
            ) : (
              <StatusChip
                status="pending-measurement"
                size="md"
                label="Pending measurement: next Tank Dip"
              />
            )}
            {early && <Notice tone="warning">{early.message}. It will be flagged.</Notice>}
          </div>
        );
      })}
    </>
  );
};

export const AfterSummary: React.FC<StepProps> = ({ values, tanks, review }) => (
  <SummaryCard>
    {values.lines.map((l, i) => (
      <div key={i} className="flex items-center gap-3">
        <span className="w-[140px] shrink-0">
          <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
        </span>
        {l.doAfterDip ? (
          <KV
            items={[
              ['After', l.afterDip ? formatQuantity(Number(l.afterDip), 'L') : '—'],
              ['Sales during', formatQuantity(Number(l.salesDuring || 0), 'L')],
              ['Received', formatQuantity(review.lines[i]?.received, 'L')],
            ]}
          />
        ) : (
          <StatusChip
            status="pending-measurement"
            size="md"
            label="Pending measurement: next Tank Dip"
          />
        )}
      </div>
    ))}
  </SummaryCard>
);
