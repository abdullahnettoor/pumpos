import React, { useId, useState } from 'react';
import {
  customRangeProblem,
  presetOf,
  rangeLabel,
  rangePresets,
  resolveRange,
  type PresetId,
  type RangeChoice,
} from '../../lib/money/statementRange.js';
import { inputClass } from '../../components/handover/Fields.js';
import { BottomSheet } from '../../ui/BottomSheet.js';

const FIELD_TEXT = '!font-sans !text-[15px] !font-medium';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Today in the station's timezone: nothing is dated after it. */
  today: string;
  choice: RangeChoice;
  onApply: (choice: RangeChoice) => void;
}

const Option: React.FC<{ checked: boolean; onSelect: () => void; children: React.ReactNode }> = ({
  checked,
  onSelect,
  children,
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={checked}
    onClick={onSelect}
    className={`flex h-11 items-center justify-between rounded-[13px] border px-3.5 text-left text-[13.5px] font-semibold ${
      checked ? 'border-accent bg-card-alt text-text-high' : 'border-line bg-card text-text-high'
    }`}
  >
    <span>{children}</span>
    {checked && (
      <span aria-hidden="true" className="text-accent">
        ✓
      </span>
    )}
  </button>
);

const Form: React.FC<Omit<Props, 'open'>> = ({ onClose, today, choice, onApply }) => {
  const current = resolveRange(choice, today);
  const selected = presetOf(choice, today);
  const [custom, setCustom] = useState(selected === 'custom');
  // Picked dates start from the range on screen, kept to what can exist (nothing after today).
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to > today ? today : current.to);
  const [problem, setProblem] = useState<string | null>(null);
  const fromId = useId();
  const toId = useId();
  const problemId = useId();

  const apply = (next: RangeChoice) => {
    onApply(next);
    onClose();
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const issue = customRangeProblem(from, to, today);
    setProblem(issue);
    if (!issue) apply({ kind: 'custom', from, to });
  };

  const chosen: PresetId = custom ? 'custom' : selected;

  return (
    <div className="flex flex-col gap-3 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">Statement range</h2>
        <p className="m-0 mt-0.5 text-xs text-text-muted">
          Showing {rangeLabel(current)}. The PDF covers the same dates.
        </p>
      </div>

      <div role="radiogroup" aria-label="Range" className="flex flex-col gap-2">
        {rangePresets(today).map((p) => (
          <Option
            key={p.id}
            checked={chosen === p.id}
            onSelect={() => {
              setCustom(false);
              apply(p.choice);
            }}
          >
            {p.label}
          </Option>
        ))}
        <Option checked={chosen === 'custom'} onSelect={() => setCustom(true)}>
          Custom range
        </Option>
      </div>

      {custom && (
        <form onSubmit={applyCustom} noValidate className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fromId} className="text-[11.5px] font-semibold text-text-muted">
                From
              </label>
              <input
                id={fromId}
                type="date"
                value={from}
                max={today}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setProblem(null);
                }}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? problemId : undefined}
                className={`${inputClass(Boolean(problem))} ${FIELD_TEXT}`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={toId} className="text-[11.5px] font-semibold text-text-muted">
                To
              </label>
              <input
                id={toId}
                type="date"
                value={to}
                max={today}
                onChange={(e) => {
                  setTo(e.target.value);
                  setProblem(null);
                }}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? problemId : undefined}
                className={`${inputClass(Boolean(problem))} ${FIELD_TEXT}`}
              />
            </div>
          </div>
          <p
            id={problemId}
            role={problem ? 'alert' : undefined}
            className="m-0 text-[11px] text-bad-fg empty:hidden"
          >
            {problem}
          </p>
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded-[13px] bg-accent text-[13.5px] font-bold text-on-accent"
          >
            Apply range
          </button>
        </form>
      )}
    </div>
  );
};

/**
 * Bottom sheet to pick the Statement's range: a preset (this month, last month,
 * last 3 months, this financial year) or two dates, both inclusive. Presets apply
 * at once; picked dates on "Apply range". The form mounts only while open, so it
 * always starts from the range on screen.
 */
export const StatementFilterSheet: React.FC<Props> = ({ open, ...rest }) => (
  <BottomSheet open={open} onClose={rest.onClose} label="Filter statement">
    <Form {...rest} />
  </BottomSheet>
);
