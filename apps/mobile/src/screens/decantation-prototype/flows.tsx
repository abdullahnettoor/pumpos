// PROTOTYPE — throwaway (#476). Three structurally different ways to record a
// Decantation on mobile.
//   A — Step cards: the handover's StepCard list on one page, summary strip on top.
//   B — One step per screen: full-screen pager, progress bar, Next/Back in the bar.
//   C — Two visits to the phone: "Tanker arrived" now (before dip, density),
//       "Finish unloading" later from the pending card (times, emptied, after dip).
import React, { useState } from 'react';
import { StepCard } from '../../components/handover/StepCard.js';
import type { StepStatus } from '../../lib/handover/steps.js';
import { DetailPage, StatusBadge } from '../../ui/index.js';
import {
  ChamberFields,
  Review,
  TankLines,
  TankerFields,
  UnloadFields,
  summaries,
} from './fields.js';
import { lakh, useVisit, type Visit, type VisitApi } from './model.js';

interface FlowProps {
  initial?: Visit;
  onDone: (v: Visit) => void;
}

const BAR_BTN =
  'flex h-11 flex-1 items-center justify-center rounded-[13px] text-[13.5px] font-bold';

const SaveBar: React.FC<{
  api: VisitApi;
  onDone: FlowProps['onDone'];
  label?: string;
  stage?: Visit['stage'];
}> = ({ api, onDone, label, stage = 'saved' }) => {
  const flagged = api.d.flags.length > 0;
  return (
    <button
      type="button"
      onClick={() => onDone({ ...api.v, stage })}
      className={`${BAR_BTN} ${flagged ? 'bg-bad text-white' : 'bg-accent text-white'}`}
    >
      {label ??
        (flagged
          ? 'Save with flag'
          : api.d.pending
            ? 'Save · pending measurement'
            : 'Save Decantation')}
    </button>
  );
};

/** Sticky live figures, same frame as the handover SummaryStrip. */
const Strip: React.FC<{ api: VisitApi }> = ({ api }) => {
  const inv = api.d.purchases.reduce((a, p) => a + p.qty, 0);
  const rec = api.d.pending ? null : api.d.lines.reduce((a, l) => a + (l.received ?? 0), 0);
  const diff = rec != null && inv ? rec - inv : null;
  return (
    <div className="sticky top-[calc(var(--pinned-header-h,-8px)+8px)] z-10 mx-3 mb-2.5 rounded-2xl border border-line bg-card px-3 py-2.5 shadow-chip">
      <div className="grid grid-cols-3 gap-2.5">
        {[
          ['Invoice', inv ? lakh(inv) : 'Not linked', 'text-text-high'],
          ['Received', rec == null ? 'Pending' : lakh(rec), 'text-text-high'],
          [
            'Variance',
            diff == null ? '—' : `${diff > 0 ? '+' : ''}${diff} L`,
            diff != null && diff < 0 ? 'text-bad-fg' : 'text-good',
          ],
        ].map(([k, v, tone], i) => (
          <div key={k} className={i ? 'min-w-0 border-l border-line pl-2.5' : 'min-w-0'}>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-faint">{k}</p>
            <p className={`num mt-0.5 truncate text-[15px] font-semibold ${tone}`}>{v}</p>
          </div>
        ))}
      </div>
      {api.d.flags.length > 0 && (
        <p className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-bad-fg">
          Will be flagged · {api.d.flags.length}
        </p>
      )}
    </div>
  );
};

const STEPS: { title: string; body: (api: VisitApi) => React.ReactNode }[] = [
  { title: 'Tanker & invoices', body: (api) => <TankerFields api={api} /> },
  { title: 'Tanks', body: (api) => <TankLines api={api} /> },
  { title: 'Tanker chambers', body: (api) => <ChamberFields api={api} /> },
  { title: 'Unloading', body: (api) => <UnloadFields api={api} /> },
  {
    title: 'After unloading',
    body: (api) => (
      <>
        <ChamberFields api={api} emptiedOnly />
        <TankLines api={api} afterOnly />
      </>
    ),
  },
];

const statusOf = (api: VisitApi, i: number): StepStatus => {
  const v = api.v;
  const filled = [
    !!v.tanker,
    v.lines.every((l) => l.before && l.density),
    v.checkChambers ? v.chambers.every((c) => c.mark) : true,
    !!(v.start && v.end),
    !!v.end && v.lines.every((l) => !l.afterDip || l.after),
  ][i];
  if (
    (i === 1 && api.d.lines.some((l) => l.densityOut)) ||
    (i === 2 && api.d.lines.some((l) => l.short))
  )
    return 'error';
  if (i === 2 && !v.checkChambers) return 'na';
  return filled ? 'done' : 'not-started';
};

/* ---------------------------------- A ---------------------------------- */
export const FlowA: React.FC<FlowProps> = ({ initial, onDone }) => {
  const api = useVisit(initial);
  const sums = summaries(api);
  return (
    <DetailPage
      title="New Decantation"
      subtitle="Step cards"
      actions={<SaveBar api={api} onDone={onDone} />}
    >
      <Strip api={api} />
      <div className="flex flex-col gap-2.5 px-3">
        {STEPS.map((s, i) => (
          <StepCard
            key={s.title}
            index={i + 1}
            title={s.title}
            status={statusOf(api, i)}
            summary={sums[i]}
            defaultOpen={i === 0}
          >
            {s.body(api)}
          </StepCard>
        ))}
        <StepCard
          index={6}
          title="Review"
          status="not-started"
          summary="Invoice vs received, flags"
        >
          <Review api={api} />
        </StepCard>
      </div>
    </DetailPage>
  );
};

/* ---------------------------------- B ---------------------------------- */
export const FlowB: React.FC<FlowProps> = ({ initial, onDone }) => {
  const api = useVisit(initial);
  const [step, setStep] = useState(0);
  const last = step === STEPS.length;
  const sums = summaries(api);
  return (
    <DetailPage
      title={last ? 'Review' : STEPS[step].title}
      subtitle={`Step ${step + 1} of ${STEPS.length + 1}`}
      actions={
        <div className="flex w-full gap-2">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            className={`${BAR_BTN} border border-line-strong text-text-high disabled:opacity-40`}
          >
            Back
          </button>
          {last ? (
            <SaveBar api={api} onDone={onDone} />
          ) : (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className={`${BAR_BTN} bg-accent text-white`}
            >
              Next
            </button>
          )}
        </div>
      }
    >
      <div className="mx-3 mb-3 flex gap-1" aria-hidden="true">
        {[...STEPS, { title: 'Review' }].map((s, i) => (
          <i
            key={s.title}
            className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-track'}`}
          />
        ))}
      </div>
      {step > 0 && (
        <div className="mx-3 mb-3 flex flex-col gap-1">
          {STEPS.slice(0, step).map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setStep(i)}
              className="flex items-center gap-2 rounded-xl bg-card-alt px-3 py-2 text-left"
            >
              <span className="text-[11px] font-bold text-good">✓</span>
              <span className="text-[12px] font-semibold text-text-high">{s.title}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-muted">{sums[i]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2.5 px-3">
        {last ? <Review api={api} /> : STEPS[step].body(api)}
      </div>
    </DetailPage>
  );
};

/* ---------------------------------- C ---------------------------------- */
export const FlowC: React.FC<FlowProps> = ({ initial, onDone }) => {
  const api = useVisit(initial);
  const finishing = initial?.stage === 'arrived';
  return finishing ? (
    <DetailPage
      title="Finish unloading"
      subtitle={`${api.v.tanker} · arrived ${api.v.start || '—'}`}
      actions={<SaveBar api={api} onDone={onDone} />}
    >
      <Strip api={api} />
      <div className="flex flex-col gap-2.5 px-3">
        <div className="rounded-xl border border-line bg-card-alt p-3 text-[12px] text-text-muted">
          Recorded on arrival: {summaries(api)[0]} · {summaries(api)[1]}
        </div>
        <UnloadFields api={api} />
        <ChamberFields api={api} emptiedOnly />
        <TankLines api={api} afterOnly />
        <Review api={api} />
      </div>
    </DetailPage>
  ) : (
    <DetailPage
      title="Tanker arrived"
      subtitle="Before unloading · finish later"
      actions={<SaveBar api={api} onDone={onDone} stage="arrived" label="Save · start unloading" />}
    >
      <div className="flex flex-col gap-2.5 px-3">
        <TankerFields api={api} />
        <TankLines api={api} />
        <ChamberFields api={api} />
        <UnloadFields api={api} />
        <StatusBadge tone="info">
          After dip and chambers emptied come in “Finish unloading”
        </StatusBadge>
      </div>
    </DetailPage>
  );
};

export const FLOWS = {
  A: { name: 'Step cards', C: FlowA },
  B: { name: 'One step per screen', C: FlowB },
  C: { name: 'Arrive now · finish later', C: FlowC },
} as const;
export type FlowKey = keyof typeof FLOWS;
