import React, { useId, useState } from 'react';
import type { StepStatus } from './steps.js';
import { CheckIcon, ChevronIcon } from './icons.js';

const STATUS_LABEL: Record<StepStatus, string> = {
  done: 'Done',
  'in-progress': 'In progress',
  'not-started': 'Not started',
  error: 'Needs attention',
  na: 'Not applicable',
};

/** Number badge: the step's status at a glance, never by colour alone. */
const Badge: React.FC<{ index: number; status: StepStatus }> = ({ index, status }) => {
  const base =
    'grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full border text-xs font-extrabold';
  if (status === 'done')
    return (
      <span className={`${base} border-transparent bg-good-soft text-good`}>
        <CheckIcon />
      </span>
    );
  if (status === 'error')
    return <span className={`${base} border-bad-line bg-bad-soft text-bad-fg`}>!</span>;
  if (status === 'in-progress')
    return <span className={`${base} border-accent bg-accent-soft text-accent`}>{index}</span>;
  if (status === 'na')
    return <span className={`${base} border-line bg-card-alt text-text-faint`}>–</span>;
  return <span className={`${base} border-line bg-card-alt text-text-muted`}>{index}</span>;
};

/**
 * One collapsible step of the handover. The body stays mounted when collapsed
 * (just hidden), so what the attendant typed, and every field's validation,
 * survives closing and re-opening the card.
 */
export const StepCard: React.FC<{
  index: number;
  title: string;
  status: StepStatus;
  /** One line shown under the title while collapsed. */
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ index, title, status, summary, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const titleId = `${id}-title`;
  const panelId = `${id}-panel`;
  return (
    <section
      data-step-status={status}
      aria-labelledby={titleId}
      className="overflow-hidden rounded-2xl border border-line bg-card"
    >
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-2.5 p-3 text-left"
        >
          <Badge index={index} status={status} />
          <span className="min-w-0 flex-1">
            <span id={titleId} className="block text-[13.5px] font-bold text-text-high">
              {title}
              <span className="sr-only"> — {STATUS_LABEL[status]}</span>
            </span>
            <span
              className={`block truncate text-[11px] ${status === 'error' ? 'text-bad-fg' : 'text-text-muted'}`}
            >
              {summary}
            </span>
          </span>
          <span
            className="flex-shrink-0 text-text-faint transition-transform duration-150"
            style={{ transform: open ? 'rotate(90deg)' : undefined }}
          >
            <ChevronIcon />
          </span>
        </button>
      </h3>
      <div
        id={panelId}
        hidden={!open}
        className={`${open ? 'flex' : 'hidden'} flex-col gap-2.5 border-t border-line px-3 pb-3 pt-3`}
      >
        {children}
      </div>
    </section>
  );
};
