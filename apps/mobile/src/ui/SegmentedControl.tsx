interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive tech ("Period"). */
  label: string;
  className?: string;
}

/** Equal-width pill toggle (Last 7 / 30 days, Customers / Suppliers). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = 'mx-3',
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid gap-0 rounded-xl border border-line bg-card p-[3px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`rounded-[9px] py-[7px] text-center text-xs font-semibold ${
              on ? 'bg-accent text-on-accent' : 'text-text-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
