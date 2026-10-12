import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DashboardTimeline, EventPin } from '@pump/shared';
import { Icon, type IconName } from '../../../../pump-ds/index.js';
import { axisTicks, axisPct, type Bar } from './timelineModel.js';
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
}> = ({ pos, events, onOpen, listRef }) =>
  createPortal(
    <ul
      ref={listRef}
      role="list"
      data-testid="timeline-pin-list"
      className="fixed z-50 rounded-input border border-border-soft bg-surface p-1 shadow-lg"
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
            <span className="truncate">{ev.label}</span>
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
}> = ({ pin, leftPct, onOpen }) => {
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
      {pos && <PinPopover pos={pos} events={events} onOpen={onOpen} listRef={listRef} />}
    </div>
  );
};

const BAR_CLASS: Record<Bar['kind'], string> = {
  closed: 'bg-brand text-on-brand font-semibold',
  running: 'border-[1.5px] border-dashed border-brand text-ink-strong font-semibold',
  ghost: 'border-[1.5px] border-dashed border-border-strong text-ink-muted',
};

export const TimelineStrip: React.FC<TimelineStripProps> = ({
  timeline,
  bars,
  pins,
  now,
  timeZone,
  onOpen,
}) => (
  <div className="relative mt-1 h-[66px] select-none" data-testid="timeline-strip">
    <div className="absolute inset-x-0 top-[22px] h-6 rounded-[7px] bg-surface-alt" />
    {bars.map((b) => (
      <div
        key={b.id}
        data-testid={`timeline-bar-${b.kind}`}
        title={b.text}
        className={`absolute top-[22px] flex h-6 items-center overflow-hidden whitespace-nowrap rounded-[7px] px-2 text-[11.5px] ${
          b.late ? 'border-[1.5px] border-dashed border-brand-warning' : ''
        } ${BAR_CLASS[b.kind]}`}
        style={{
          left: `${b.leftPct}%`,
          width: `${b.widthPct}%`,
          ...(b.kind === 'running' ? { backgroundImage: HATCH } : {}),
        }}
      >
        <span className="truncate">{b.text}</span>
        {b.varianceText && <span className="ml-1 shrink-0 opacity-75">· {b.varianceText}</span>}
      </div>
    ))}
    <div
      data-testid="timeline-now"
      className="absolute bottom-3 top-4 w-0.5 bg-brand-danger"
      style={{ left: `${axisPct(now, timeline)}%` }}
    />
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
    <div className="absolute inset-x-0 bottom-0 h-3 text-[10px] text-ink-muted">
      {axisTicks(timeline, timeZone).map((t, i, all) => (
        <span
          key={t.leftPct}
          data-testid="timeline-axis-label"
          className={`absolute ${i === 0 ? '' : i === all.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
          style={{ left: `${t.leftPct}%` }}
        >
          {t.label}
        </span>
      ))}
    </div>
  </div>
);
