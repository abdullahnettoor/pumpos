import React from 'react';
import { shiftWorkspaceAction } from '@pump/shared';
import { Play } from 'lucide-react';
import { Button, Chip, Dot } from '../../../pump-ds/index.js';
import { inr } from '../../../utils/format.js';
import { DashboardCard } from '../frame/DashboardCard.js';
import { useDashboard } from '../frame/DashboardContext.js';
import { useForecourtModel } from './forecourt/useForecourtModel.js';
import { type DuRow, type LastClosed, type LiveForecourt } from './forecourt/derive.js';

const VarianceChip: React.FC<{ amount: number }> = ({ amount }) => (
  <Chip
    size="xs"
    tone={amount === 0 ? 'success' : amount < 0 ? 'danger' : 'info'}
    data-testid="variance-badge"
  >
    {amount === 0 ? 'Tallied' : `${amount > 0 ? '+' : '−'}${inr(Math.abs(amount))}`}
  </Chip>
);

const DuLine: React.FC<{ du: DuRow }> = ({ du }) => (
  <li
    className="flex items-center gap-3 px-3.5 py-2 text-[12.5px]"
    data-testid="du-row"
    data-status={du.status}
  >
    <b className="w-11 shrink-0 text-ink">{du.duName}</b>
    <div className="min-w-0 flex-1">
      <div className="truncate font-semibold text-ink">{du.attendant}</div>
      <div className="truncate text-[11.5px] text-ink-muted">{du.fuels}</div>
    </div>
    <div className="shrink-0 text-right tabular-nums">
      {du.status === 'recorded' ? (
        <>
          <div>{inr(du.declared ?? 0)}</div>
          <div className="text-[11px] text-ink-muted">declared</div>
        </>
      ) : (
        <>
          <div>{du.dropped == null ? '—' : inr(du.dropped)}</div>
          <div className="text-[11px] text-ink-muted">dropped</div>
        </>
      )}
    </div>
    <div className="w-[104px] shrink-0 text-right">
      {du.status === 'recorded' ? (
        <VarianceChip amount={du.variance ?? 0} />
      ) : du.status === 'due' ? (
        <Chip size="xs" tone="warning">
          Handover due
        </Chip>
      ) : (
        <Chip size="xs" tone="neutral">
          Pending
        </Chip>
      )}
    </div>
  </li>
);

const Live: React.FC<{ m: LiveForecourt }> = ({ m }) => (
  <div className="rounded-lg border border-border-soft bg-surface">
    <div className="border-b border-border-soft px-3.5 py-3">
      <div className="flex items-center gap-2 text-[13px]">
        <Dot tone={m.pastEnd ? 'warning' : 'success'} pulse={!m.pastEnd} />
        <b className="font-semibold text-ink">
          {m.pastEnd ? 'Past scheduled end' : `Live ${m.elapsed}`}
        </b>
        {m.window && <span className="text-ink-muted">{m.window}</span>}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[12.5px]">
        <span className="text-ink-muted">Handovers</span>
        <b className="font-medium tabular-nums text-ink">
          {m.recorded} / {m.total}
        </b>
      </div>
      <div className="mt-1.5 flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: m.total }, (_, i) => (
          <i
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < m.recorded ? 'bg-success-fg' : m.pastEnd ? 'bg-warning-fg' : 'bg-surface-alt'
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3.5 text-[11.5px] text-ink-muted">
        <span>
          Floats <b className="tabular-nums text-ink">{inr(m.floats)}</b>
        </span>
        <span>
          Drops <b className="tabular-nums text-ink">{inr(m.drops)}</b>
        </span>
        {m.open > 0 && (
          <span className={`ml-auto ${m.pastEnd ? 'text-warning-fg' : ''}`}>
            {m.pastEnd
              ? `${m.open} overdue`
              : `${m.open} to hand over${m.endLabel ? ` by ${m.endLabel}` : ''}`}
          </span>
        )}
      </div>
    </div>
    <ul className="divide-y divide-border-soft">
      {m.dus.map((d) => (
        <DuLine key={d.key} du={d} />
      ))}
    </ul>
  </div>
);

const LastClosedBlock: React.FC<{ last: LastClosed; onOpen: () => void }> = ({ last, onOpen }) => (
  <div
    className="mt-2 rounded-lg border border-border-soft bg-surface px-3.5 py-3"
    data-testid="last-closed"
  >
    <div className="flex items-center">
      <span className="text-[12.5px] text-ink-muted">Last closed: {last.name}</span>
      <button
        type="button"
        className="ml-auto text-[12.5px] font-medium text-brand hover:underline"
        onClick={onOpen}
      >
        Summary ›
      </button>
    </div>
    <div className="mt-1.5 flex gap-[18px] text-[12.5px]">
      <div>
        <div className="text-[11px] text-ink-muted">Sales</div>
        <div className="tabular-nums">{last.sales == null ? '—' : inr(last.sales)}</div>
      </div>
      <div>
        <div className="text-[11px] text-ink-muted">Litres</div>
        <div className="tabular-nums">
          {last.litres == null
            ? '—'
            : last.litres.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div>
        <div className="text-[11px] text-ink-muted">Variance</div>
        {last.variance == null ? <div>—</div> : <VarianceChip amount={last.variance} />}
      </div>
    </div>
  </div>
);

export const ForecourtCard: React.FC = () => {
  const { role, onNavigate } = useDashboard();
  const { model, queries } = useForecourtModel();
  const canAct = shiftWorkspaceAction(role) === 'act';
  const openSummary = (id: string) => onNavigate('/shifts', { openShiftSummaryId: id });

  return (
    <DashboardCard
      card="forecourt"
      title="Forecourt"
      variant="plain"
      query={queries}
      placeholderHeight={330}
    >
      {model?.kind === 'live' ? (
        <>
          <Live m={model} />
          {model.last && (
            <LastClosedBlock last={model.last} onOpen={() => openSummary(model.last!.shiftId)} />
          )}
        </>
      ) : model ? (
        <>
          <div className="rounded-lg border border-border-soft bg-surface px-4 py-5 text-center">
            <div className="text-[13px] font-semibold text-ink">
              {model.kind === 'between' ? 'Between shifts' : 'No shift running'}
            </div>
            {model.hint && <div className="mt-1 text-[12.5px] text-ink-muted">{model.hint}</div>}
            {canAct ? (
              <Button
                className="mt-3"
                size="sm"
                leftIcon={<Play />}
                onClick={() => onNavigate('/shifts')}
              >
                Open shift
              </Button>
            ) : (
              <div className="mt-2.5 text-[12px] text-ink-muted">
                A manager or staff member opens the shift.
              </div>
            )}
          </div>
          {model.last && (
            <LastClosedBlock last={model.last} onOpen={() => openSummary(model.last!.shiftId)} />
          )}
        </>
      ) : null}
    </DashboardCard>
  );
};
