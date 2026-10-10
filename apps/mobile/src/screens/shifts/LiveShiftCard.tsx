import React from 'react';
import { rupees } from '../../lib/home/format.js';
import type { DuStatus, LiveDu, LiveShiftCard as LiveCard } from '../../lib/shifts/liveCard.js';
import { varianceBadge } from '../../lib/shifts/variance.js';
import { StatusBadge, type BadgeTone } from '../../ui/index.js';

const STATUS: Record<DuStatus, { label: string; tone: BadgeTone }> = {
  recorded: { label: 'Recorded', tone: 'good' },
  pending: { label: 'Pending', tone: 'muted' },
  due: { label: 'Handover due', tone: 'warn' },
};

const Figure: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 border-l border-line px-2.5 first:border-l-0">
    <p className="text-[11px] font-medium text-text-muted">{label}</p>
    <p className="num mt-0.5 text-base font-semibold text-text-high">{value}</p>
  </div>
);

const DuRow: React.FC<{ du: LiveDu }> = ({ du }) => {
  const status = STATUS[du.status];
  const variance = du.variance === null ? null : varianceBadge(du.variance);
  return (
    <li className="flex items-center gap-2.5 border-t border-line px-3 py-[11px] first:border-t-0">
      <span
        aria-hidden="true"
        className="grid h-8 min-w-8 max-w-[64px] flex-shrink-0 place-items-center truncate rounded-[9px] border border-line bg-card-alt px-1.5 text-[11px] font-bold text-text-muted"
      >
        {du.duName}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-text-high">{du.attendant}</p>
        <p className="num truncate text-[11px] text-text-muted">
          {du.declared === null
            ? `${du.duName} · Not handed over yet`
            : `Declared ${rupees(du.declared)} · ${variance?.text === 'Balanced' ? 'balanced' : `var ${variance?.text}`}`}
        </p>
      </div>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    </li>
  );
};

/** The running Shift, view-only: header, floats / drops / nozzles, Handover progress, one row per DU. */
export const LiveShiftCard: React.FC<{ shift: LiveCard }> = ({ shift }) => (
  <section
    aria-label="Live shift"
    className="mx-3 overflow-hidden rounded-[14px] border border-line bg-card"
  >
    <div className="flex items-center gap-3 border-b border-hero-line bg-[image:var(--hero)] px-3.5 py-3.5">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
      />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold text-text-high">{shift.name}</p>
        <p className="truncate text-xs text-text-muted">
          {[shift.businessDateLabel, shift.since].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="ml-auto flex-shrink-0 text-right">
        <p className="num text-xl font-semibold text-accent">{shift.elapsed}</p>
        <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted">open</p>
      </div>
    </div>

    <div className="grid grid-cols-3 px-1 py-3">
      <Figure label="Opening floats" value={rupees(shift.openingFloats)} />
      <Figure label="Cash drops" value={rupees(shift.cashDrops)} />
      <Figure label="Nozzles" value={String(shift.nozzles)} />
    </div>

    {shift.total > 0 && (
      <div className="px-3.5 pb-3">
        <div className="mb-1.5 flex justify-between">
          <span className="text-[11px] font-medium text-text-muted">Handovers</span>
          <span className="num text-xs text-text-muted">
            {shift.recorded} / {shift.total}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Handovers recorded"
          aria-valuemin={0}
          aria-valuemax={shift.total}
          aria-valuenow={shift.recorded}
          className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
        >
          {shift.dus.map((du) => (
            <i
              key={du.key}
              className={`block flex-1 ${du.status === 'recorded' ? 'bg-accent' : 'bg-track'}`}
            />
          ))}
        </div>
      </div>
    )}

    {shift.total > 0 ? (
      <ul className="border-t border-line">
        {shift.dus.map((du) => (
          <DuRow key={du.key} du={du} />
        ))}
      </ul>
    ) : (
      <p className="border-t border-line px-3.5 py-3 text-xs text-text-muted">
        No attendants are on a Dispenser Unit yet.
      </p>
    )}
  </section>
);
