import React from 'react';

interface Props {
  /** "Receivables · 23 customers", "Owes you", ... */
  label: string;
  /** The figure, already formatted. */
  value: string;
  /** Card surface classes; the default is the neutral hero gradient. */
  surface?: string;
  /** Badge at the top right ("Over limit"). */
  badge?: React.ReactNode;
  /** Names the card for assistive tech. */
  ariaLabel?: string;
  state?: string;
  children?: React.ReactNode;
}

const HERO_SURFACE = 'border-hero-line bg-[image:var(--hero)]';

/**
 * The big-figure card both Money lists (Receivables / Payables) and the
 * Customer page's balance card are built on: label, a 30px figure, an optional
 * badge, and whatever sits under it (children).
 */
export const HeroCard: React.FC<Props> = ({
  label,
  value,
  surface = HERO_SURFACE,
  badge,
  ariaLabel,
  state,
  children,
}) => (
  <section
    aria-label={ariaLabel}
    data-state={state}
    className={`mx-3 rounded-[14px] border p-3.5 ${surface}`}
  >
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-[11px] font-medium text-text-muted">{label}</p>
        <p className="num mt-1 text-[30px] font-semibold tracking-[-0.03em] text-text-high">
          {value}
        </p>
      </div>
      {badge}
    </div>
    {children}
  </section>
);
