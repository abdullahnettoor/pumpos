import React from 'react';

interface Props {
  /** "Receivables · 23 customers" */
  label: string;
  /** The total, already formatted. */
  value: string;
  sub?: React.ReactNode;
}

/** Total card heading a Money list. Seam for #398 / the payables summary: aging and month figures sit under `sub`. */
export const MoneyHero: React.FC<Props> = ({ label, value, sub }) => (
  <section className="mx-3 rounded-[14px] border border-hero-line bg-[image:var(--hero)] p-3.5">
    <p className="text-[11px] font-medium text-text-muted">{label}</p>
    <p className="num mt-1 text-[30px] font-semibold tracking-[-0.03em] text-text-high">{value}</p>
    {sub && <div className="mt-1 text-[11.5px] text-text-muted">{sub}</div>}
  </section>
);
