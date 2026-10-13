import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DashboardTimeline, EventPin } from '@pump/shared';
import { Icon, type IconName } from '../../../../pump-ds/index.js';
import {
  axisPct,
  clockLabel,
  hourTicks,
  type Bar,
  type OpeningChip,
  type ScheduleSegment,
} from './timelineModel.js';
import type { PinTarget, TimelineEvent } from './activityPins.js';

/** Pin chip colours: border + icon in the event's tone (prototype). */
const PIN_TONE: Record<string, string> = {
  neutral: 'border-border-strong text-ink-muted',
  success: 'border-success-fg text-success-fg',
  info: 'border-info-fg text-info-fg',
  warning: 'border-warning-fg text-warning-fg',
  danger: 'border-danger-fg text-danger-fg',
};

const HATCH =
  'repeating-linear-gradient(45deg, color-mix(in srgb, var(--brand-primary) 35%, transparent) 0 4px, color-mix(in srgb, var(--brand-primary) 12%, transparent) 4px 8px)';

const POPOVER_W = 224;
const EDGE = 8;
/** Keep pin centres this far inside the strip so the 20px chip never clips. */
const PIN_INSET_PCT = 1.5;

export interface TimelineStripProps {
  timeline: DashboardTimeline;
  bars: Bar[];
  chips: OpeningChip[];
  segments: ScheduleSegment[];
  pins: EventPin[];
  now: number;
  timeZone: string;
  onOpen: (target: PinTarget) => void;
}

interface PopoverPos {
  left: number;
  top: number;
}

/** Anchor-relative position of the list, clamped inside the viewport. */
function popoverPos(anchor: HTMLElement): PopoverPos {
  const r = anchor.getBoundingClientRect();
  const left = Math.min(
    Math.max(EDGE, r.left + r.width / 2 - POPOVER_W / 2),
    window.innerWidth - POPOVER_W - EDGE,
  );
  return { left, top: r.bottom + 4 };
}

/** Event list rendered in a portal (never clipped by a card). */
const PinPopover: React.FC<{
  pos: PopoverPos;
  events: TimelineEvent[];
  onOpen: (t: PinTarget) => void;
  listRef: React.RefObject<HTMLUListElement>;
  timeZone: string;
}> = ({ pos, events, onOpen, listRef, timeZone }) =>
  createPortal(
    <ul
      ref={listRef}
      role="list"
      data-testid="timeline-pin-list"
      className="fixed z-50 m-0 list-none rounded-input border border-border-soft bg-surface p-1 shadow-lg"
      style={{ left: pos.left, top: pos.top, width: POPOVER_W }}
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
            <span className="min-w-0 flex-1 truncate">{ev.label}</span>
            <span
              data-testid="timeline-pin-time"
              className="shrink-0 text-[11px] tabular-nums text-ink-muted"
            >
              {clockLabel(typeof ev.at === 'number' ? ev.at : Date.parse(ev.at), timeZone)}
            </span>
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );

const PinButton: React.FC<{
  pin: EventPin;
  leftPct: number;
  onOpen: (t: PinTarget) => void;
  timeZone: string;
}> = ({ pin, leftPct, onOpen, timeZone }) => {
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const show = () => ref.current && setPos(popoverPos(ref.current));
  // Click-opened; closes on an outside press or Escape. The list lives in a
  // portal, so "outside" is checked against both the pin and the list.
  const open = pos !== null;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !listRef.current?.contains(t)) setPos(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const events = pin.events as TimelineEvent[];
  const first = events[0];
  const left = Math.min(100 - PIN_INSET_PCT, Math.max(PIN_INSET_PCT, leftPct));
  return (
    <div ref={ref} className="absolute top-0 -translate-x-1/2" style={{ left: `${left}%` }}>
      <button
        type="button"
        data-testid="timeline-pin"
        data-count={pin.count}
        aria-label={pin.count > 1 ? `${pin.count} events` : first.label}
        className={`flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border-[1.5px] bg-surface text-[10px] font-semibold ${
          pin.count > 1 ? 'px-1' : ''
        } ${PIN_TONE[pin.tone]}`}
        onClick={() => {
          if (pin.count === 1 && first.target) onOpen(first.target);
          else if (open) setPos(null);
          else show();
        }}
      >
        <Icon name={pin.icon as IconName} size="xs" />
        {pin.count > 1 && <span>{pin.count}</span>}
      </button>
      {pos && (
        <PinPopover
          pos={pos}
          events={events}
          onOpen={onOpen}
          listRef={listRef}
          timeZone={timeZone}
        />
      )}
    </div>
  );
};

const CHIP_TONE: Record<OpeningChip['tone'], string> = {
  success: 'border-success-fg text-success-fg',
  warning: 'border-warning-fg text-warning-fg',
  info: 'border-info-fg text-info-fg',
};

const BAR_CLASS: Record<Bar['kind'], string> = {
  closed: 'bg-brand text-on-brand font-semibold',
  running: 'border-[1.5px] border-dashed text-ink-strong font-semibold',
  ghost: 'border-[1.5px] border-dashed border-border-strong text-ink-muted',
};

/** Bars narrower than this (percent of the axis) show the shorter opening chip. */
const SHORT_BAR_PCT = 25;

/** Hour labels this close (percent) to the now pill are hidden under it. */
const NOW_LABEL_CLEARANCE_PCT = 2.2;

/**
 * The "now" clock pill under the timeline's red line: solid danger with its
 * paired `text-on-danger`. Placement comes from the caller's `className`.
 */
export const TimelineNowPill: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({
  className,
  ...rest
}) => (
  <span
    className={`whitespace-nowrap rounded-full bg-brand-danger px-1.5 text-[9.5px] font-semibold leading-[14px] text-on-danger ${className ?? ''}`}
    {...rest}
  />
);

export const TimelineStrip: React.FC<TimelineStripProps> = ({
  timeline,
  bars,
  chips,
  segments,
  pins,
  now,
  timeZone,
  onOpen,
}) => {
  const nowPct = axisPct(now, timeline);
  const chipOf = new Map(chips.map((c) => [c.id, c]));
  return (
    <div className="relative mt-1 h-[70px] select-none" data-testid="timeline-strip">
      <div className="absolute inset-x-0 top-[26px] h-6 rounded-[7px] bg-surface-alt" />
      {bars.map((b) => {
        const chip = chipOf.get(b.id);
        return (
          <div
            key={b.id}
            data-testid={`timeline-bar-${b.kind}`}
            title={b.times ? `${b.text} · ${b.times}` : b.text}
            className={`absolute top-[26px] flex h-6 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[7px] px-2 text-[11.5px] ${
              b.late ? 'border-warning-fg' : b.kind === 'running' ? 'border-brand' : ''
            } ${BAR_CLASS[b.kind]}`}
            style={{
              left: `${b.leftPct}%`,
              width: `${b.widthPct}%`,
              // The live shift is hatched up to now; the rest of its window stays open.
              ...(b.kind === 'running'
                ? {
                    backgroundImage: HATCH,
                    backgroundSize: `${(b.progress ?? 1) * 100}% 100%`,
                    backgroundRepeat: 'no-repeat',
                  }
                : {}),
            }}
          >
            {b.carry && (
              <span aria-hidden="true" data-testid="timeline-carry-marker" className="shrink-0">
                ‹
              </span>
            )}
            <span className="min-w-[5.5rem] truncate">{b.text}</span>
            {b.varianceText && <span className="shrink-0 opacity-75">· {b.varianceText}</span>}
            {chip && (
              <span
                data-testid="timeline-opening-chip"
                className={`ml-auto flex h-4 min-w-0 items-center truncate rounded-full border bg-surface px-1.5 text-[10.5px] font-semibold ${CHIP_TONE[chip.tone]}`}
              >
                {b.widthPct < SHORT_BAR_PCT ? chip.shortText : chip.text}
              </span>
            )}
          </div>
        );
      })}
      <div className="absolute inset-x-0 top-0 h-5">
        {pins.map((p) => (
          <PinButton
            key={`${p.at}-${p.events[0].id}`}
            pin={p}
            leftPct={axisPct(p.at, timeline)}
            onOpen={onOpen}
            timeZone={timeZone}
          />
        ))}
      </div>
      <div className="absolute inset-x-0 top-[52px] h-4" aria-hidden="true">
        {hourTicks(segments, timeline, timeZone).map((t, i, all) => (
          <React.Fragment key={t.leftPct}>
            <span
              className={`absolute top-0 w-px ${t.major ? 'h-2 bg-ink-muted' : 'h-1 bg-border-strong'}`}
              style={{ left: `${t.leftPct}%` }}
            />
            {Math.abs(t.leftPct - nowPct) >= NOW_LABEL_CLEARANCE_PCT && (
              <span
                data-testid="timeline-axis-label"
                className={`absolute top-[7px] whitespace-nowrap text-[9.5px] leading-none ${
                  t.major ? 'font-semibold text-ink' : 'text-ink-faint'
                } ${i === 0 ? '' : i === all.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
                style={{ left: `${t.leftPct}%` }}
              >
                {t.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </div>
      <div
        data-testid="timeline-now"
        className="pointer-events-none absolute top-[22px] z-10 h-[34px] w-0.5 -translate-x-1/2 bg-brand-danger"
        style={{ left: `${nowPct}%` }}
      />
      <TimelineNowPill
        data-testid="timeline-now-label"
        className="pointer-events-none absolute top-[56px] z-10 -translate-x-1/2"
        style={{ left: `${Math.min(97, Math.max(3, nowPct))}%` }}
      >
        {clockLabel(now, timeZone)}
      </TimelineNowPill>
    </div>
  );
};
