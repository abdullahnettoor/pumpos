import React from 'react';
import type { Station } from '@pump/shared';
import { StepCard } from '../../components/handover/StepCard.js';
import {
  ChambersStep,
  StartStep,
  TankerStep,
  TanksStep,
} from '../../components/decantation/ArrivalSteps.js';
import { Warn } from '../../components/decantation/fields.js';
import { useSaveVisit } from '../../components/decantation/useSaveVisit.js';
import { useVisit } from '../../lib/decantation/useVisit.js';
import { formatQuantity } from '@pump/ui';
import { DetailPage } from '../../ui/index.js';

/**
 * First half of a tanker visit, saved when the tanker arrives: who and which
 * invoices, the tanks and their before dip and density, the chambers, the start
 * time. It saves as a DRAFT so routine Tank Dips do not measure the tanks
 * mid-unload; "Finish unloading" completes it.
 */
export const TankerArrivedPage: React.FC<{ station: Station }> = ({ station }) => {
  const v = useVisit(station);
  const { save, error, submitted, saving } = useSaveVisit(v, station.id);
  const flagged = v.flags.flags.length > 0;
  const lines = v.values.lines;

  return (
    <DetailPage
      title="Tanker arrived"
      subtitle="Before unloading · finish it later"
      actions={
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(true)}
          className={`flex h-11 flex-1 items-center justify-center rounded-[13px] text-[13.5px] font-bold text-on-accent disabled:opacity-60 ${flagged ? 'bg-bad' : 'bg-accent'}`}
        >
          {saving
            ? 'Saving…'
            : flagged
              ? 'Save with flag · start unloading'
              : 'Save · start unloading'}
        </button>
      }
    >
      <div className="flex flex-col gap-2.5 px-3">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-xs text-bad-fg"
          >
            {error}
          </p>
        )}
        {submitted && v.errors.any && (
          <Warn tone="bad">{v.errors.summary ?? 'Check the highlighted fields to save.'}</Warn>
        )}
        <StepCard
          index={1}
          title="Tanker & invoices"
          status={v.values.tankerNumber.trim() ? 'done' : 'not-started'}
          summary={v.values.tankerNumber.trim() || 'Tanker number needed'}
          defaultOpen
        >
          <TankerStep visit={v} showErrors={submitted} />
        </StepCard>
        <StepCard
          index={2}
          title="Tanks"
          status={
            v.flags.flags.some((f) => f.code === 'DENSITY_OUT_OF_TOLERANCE')
              ? 'error'
              : lines.every((l) => l.tankId && l.beforeDip.trim())
                ? 'done'
                : 'not-started'
          }
          summary={lines
            .map(
              (l) =>
                `${v.tanks.find((t) => t.id === l.tankId)?.name ?? '—'}: ${l.beforeDip ? formatQuantity(Number(l.beforeDip), 'L') : '—'}`,
            )
            .join(' · ')}
          defaultOpen
        >
          <TanksStep visit={v} showErrors={submitted} />
        </StepCard>
        <StepCard
          index={3}
          title="Tanker chambers"
          status={v.values.checkChambers ? 'done' : 'na'}
          summary={v.values.checkChambers ? `${v.values.chambers.length} chambers` : 'Not checked'}
        >
          <ChambersStep visit={v} />
        </StepCard>
        <StepCard
          index={4}
          title="Start time"
          status={v.values.unloadStart ? 'done' : 'not-started'}
          summary={v.values.unloadStart || '—'}
        >
          <StartStep visit={v} />
        </StepCard>
      </div>
    </DetailPage>
  );
};
