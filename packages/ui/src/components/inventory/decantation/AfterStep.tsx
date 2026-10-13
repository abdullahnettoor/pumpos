import React from 'react';
import { Chip } from '../../../pump-ds/index.js';
import { Field, NumberInput, TextInput } from '../../primitives/Field.js';
import { KV, LINE_COLORS, LineTag, Notice } from './StepSection.js';
import { formatQuantity } from '../../../utils/format.js';
import { grid, lineLabel, SummaryCard, type StepProps } from './stepShared.js';

export const AfterStep: React.FC<StepProps> = ({ form, values, tanks, flags, review }) => {
  const { register, formState } = form;
  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Optional. Skip a tank to leave it pending: the next Tank Dip measures it.
      </div>
      {values.lines.map((l, i) => {
        const early = flags.flags.find(
          (f) => f.code === 'EARLY_AFTER_DIP' && f.tankLineId === String(i),
        );
        const received = review.lines[i]?.received;
        const errs = formState.errors.lines?.[i];
        return (
          <div
            key={i}
            style={{
              borderLeft: `3px solid ${LINE_COLORS[i % LINE_COLORS.length]}`,
              padding: '4px 0 2px 12px',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
              <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <input
                  type="checkbox"
                  aria-label={`Measure line ${i + 1} now`}
                  {...register(`lines.${i}.doAfterDip`)}
                />
                Take after dip now
              </label>
            </div>
            {l.doAfterDip ? (
              <div style={grid('1fr 1fr 1fr 1fr')}>
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
                  <div style={{ paddingTop: 8, fontWeight: 600 }}>
                    {formatQuantity(received, 'L')}
                  </div>
                </Field>
              </div>
            ) : (
              <Chip size="sm" tone="info">
                Pending measurement: next Tank Dip
              </Chip>
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
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 140 }}>
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
          <Chip size="sm" tone="info">
            Pending measurement: next Tank Dip
          </Chip>
        )}
      </div>
    ))}
  </SummaryCard>
);
