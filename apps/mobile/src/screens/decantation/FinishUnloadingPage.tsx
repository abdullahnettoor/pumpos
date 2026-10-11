import React from 'react';
import { isoToLocalTime } from '@pump/ui';
import type { DecantationView, Station } from '@pump/shared';
import { StepCard } from '../../components/handover/StepCard.js';
import {
  AfterDipStep,
  ReviewStep,
  UnloadEndStep,
} from '../../components/decantation/FinishSteps.js';
import { Warn } from '../../components/decantation/fields.js';
import { useSaveVisit } from '../../components/decantation/useSaveVisit.js';
import { DiscardDraft } from '../../components/decantation/DiscardDraft.js';
import { useVisit } from '../../lib/decantation/useVisit.js';
import { fmtLitres } from '../../lib/decantation/format.js';
import { DetailPage } from '../../ui/index.js';

/**
 * Second half, for a DRAFT visit: end time, chambers emptied, an optional after
 * dip per tank, and a review. Saves the whole visit (lines keep their ids) as a
 * non-draft. A tank with no after dip waits for the next Tank Dip.
 */
export const FinishUnloadingPage: React.FC<{ station: Station; decantation: DecantationView }> = ({
  station,
  decantation,
}) => {
  const v = useVisit(station, decantation);
  const { save, error, submitted, saving } = useSaveVisit(v, station.id, decantation.id);
  const flagged = v.flags.flags.length > 0;
  const arrived = isoToLocalTime(decantation.unloadStartedAt ?? decantation.createdAt, v.timeZone);
  const measured = v.review.lines.filter((l) => l.received != null).length;

  return (
    <DetailPage
      title="Finish unloading"
      subtitle={`${decantation.tankerNumber} · arrived ${arrived}`}
      actions={
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(false)}
          className={`flex h-11 flex-1 items-center justify-center rounded-[13px] text-[13.5px] font-bold text-on-accent disabled:opacity-60 ${flagged ? 'bg-bad' : 'bg-accent'}`}
        >
          {saving ? 'Saving…' : flagged ? 'Save with flag' : 'Save Decantation'}
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
        <div className="rounded-xl border border-line bg-card-alt p-3 text-[12px] text-text-muted">
          Recorded on arrival:{' '}
          {v.values.lines
            .map(
              (l) =>
                `${v.tanks.find((t) => t.id === l.tankId)?.name ?? 'Tank'} ${fmtLitres(Number(l.beforeDip))}`,
            )
            .join(' · ')}
        </div>
        <StepCard
          index={1}
          title="Unloading finished"
          status={v.values.unloadEnd ? 'done' : 'not-started'}
          summary={`${v.values.unloadStart || '—'} → ${v.values.unloadEnd || '—'}`}
          defaultOpen
        >
          <UnloadEndStep visit={v} />
        </StepCard>
        <StepCard
          index={2}
          title="After unloading"
          status={measured === v.values.lines.length ? 'done' : 'not-started'}
          summary={`${measured} of ${v.values.lines.length} measured now`}
          defaultOpen
        >
          <AfterDipStep visit={v} />
        </StepCard>
        <StepCard
          index={3}
          title="Review"
          status={flagged ? 'error' : 'not-started'}
          summary={flagged ? `${v.flags.flags.length} to flag` : 'Invoice vs received, stock'}
          defaultOpen
        >
          <ReviewStep visit={v} />
        </StepCard>
        {decantation.status === 'DRAFT' && (
          <DiscardDraft stationId={station.id} decantationId={decantation.id} />
        )}
      </div>
    </DetailPage>
  );
};
