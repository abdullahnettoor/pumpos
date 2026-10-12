import React, { useState } from 'react';
import type { DashboardTimeline, EventPin } from '@pump/shared';
import { Icon, type IconName } from '../../../../pump-ds/index.js';
import { axisTicks, axisPct, money, type Bar } from './timelineModel.js';
import type { PinTarget, TimelineEvent } from './activityPins.js';

const TONE: Record<string, string> = {
  neutral: 'bg-surface-alt text-ink-muted border-border-soft',
  success: 'bg-success-bg text-success-fg border-success-fg/40',
  info: 'bg-info-bg text-info-fg border-info-fg/40',
  warning: 'bg-warning-bg text-warning-fg border-warning-fg/40',
  danger: 'bg-danger-bg text-danger-fg border-danger-fg/40',
};

const HATCH =
  'repeating-linear-gradient(45deg, color-mix(in srgb, var(--brand-primary) 35%, transparent) 0 4px, color-mix(in srgb, var(--brand-primary) 12%, transparent) 4px 8px)';

export interface TimelineStripProps {
  timeline: DashboardTimeline;
  bars: Bar[];
  pins: EventPin[];
  now: number;
  timeZone: string;
  onOpen: (target: PinTarget) => void;
}

const PinButton: React.FC<{
  pin: EventPin;
  leftPct: number;
  onOpen: (t: PinTarget) => void;
}> = ({ pin, leftPct, onOpen }) => {
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const events = pin.events as TimelineEvent[];
  const first = events[0];
  return (
    <div
      className="absolute top-0 -translate-x-1/2"
      style={{ left: `${leftPct}%` }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        data-testid="timeline-pin"
        data-count={pin.count}
        aria-label={pin.count > 1 ? `${pin.count} events` : first.label}
        className={`relative flex size-5 items-center justify-center rounded-full border ${TONE[pin.tone]}`}
        onClick={() => {
          if (pin.count === 1 && first.target) onOpen(first.target);
          else setOpen((o) => !o);
        }}
      >
        <Icon name={pin.icon as IconName} size="xs" />
        {pin.count > 1 && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-ink px-1 text-[9px] leading-3 text-surface">
            {pin.count}
          </span>
        )}
      </button>
      {open && (
        <ul
          role="list"
          className="absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-input border border-border-soft bg-surface p-1 shadow-lg"
        >
          {events.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                disabled={!ev.target}
                onClick={() => ev.target && onOpen(ev.target)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-ink enabled:hover:bg-surface-alt"
              >
                <Icon name={ev.icon as IconName} size="xs" />
                <span className="truncate">{ev.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const TimelineStrip: React.FC<TimelineStripProps> = ({
  timeline,
  bars,
  pins,
  now,
  timeZone,
  onOpen,
}) => (
  <div className="relative h-[76px] select-none" data-testid="timeline-strip">
    <div className="absolute inset-x-0 top-0 h-5">
      {pins.map((p) => (
        <PinButton
          key={`${p.at}-${p.events[0].id}`}
          pin={p}
          leftPct={axisPct(p.at, timeline)}
          onOpen={onOpen}
        />
      ))}
    </div>
    <div className="absolute inset-x-0 top-7 h-7 rounded-input bg-surface-alt">
      {bars.map((b) => (
        <div
          key={b.id}
          data-testid={`timeline-bar-${b.kind}`}
          title={b.label}
          className={`absolute inset-y-0 flex items-center overflow-hidden rounded-input px-1.5 text-[11px] ${
            b.kind === 'closed'
              ? 'bg-brand text-on-brand'
              : b.kind === 'running'
                ? 'border border-brand text-ink'
                : 'border border-dashed border-border-strong text-ink-muted'
          }`}
          style={{
            left: `${b.leftPct}%`,
            width: `${b.widthPct}%`,
            ...(b.kind === 'running' ? { backgroundImage: HATCH } : {}),
          }}
        >
          <span className="truncate">{b.label}</span>
        </div>
      ))}
      <div
        data-testid="timeline-now"
        className="absolute -inset-y-1 w-px bg-danger-fg"
        style={{ left: `${axisPct(now, timeline)}%` }}
      />
    </div>
    <div className="absolute inset-x-0 top-[62px] h-3 text-[10px] text-ink-muted">
      {axisTicks(timeline, timeZone).map((t) => (
        <span
          key={t.leftPct}
          className="absolute -translate-x-1/2"
          style={{ left: `${t.leftPct}%` }}
        >
          {t.label}
        </span>
      ))}
    </div>
  </div>
);

export const BarSummary: React.FC<{ bars: Bar[] }> = ({ bars }) => {
  const done = bars.filter((b) => b.kind === 'closed' && b.total != null);
  if (done.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-ink-muted">
      {done.map((b) => (
        <li key={b.id}>
          {b.label} · {money(b.total ?? 0)}
          {b.variance ? (
            <span className={b.variance < 0 ? 'text-danger-fg' : 'text-warning-fg'}>
              {' '}
              · {b.variance > 0 ? '+' : ''}
              {money(b.variance)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
};
