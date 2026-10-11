const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export const fmtLitres = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? '—' : `${nf.format(n)} L`;

export const fmtSignedLitres = (n: number): string =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${nf.format(Math.abs(n))} L`;
