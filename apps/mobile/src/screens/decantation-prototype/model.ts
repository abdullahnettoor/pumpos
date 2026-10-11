// PROTOTYPE — throwaway (#476). Mobile Decantation, in-memory mock only.
// Plan: three variants of the New Decantation flow on the pushed
// DecantationsPage (from Home → Tanks → "Decantations ›"), switched by
// ?mvariant=A|B|C and the floating bar.
import { useMemo, useState } from 'react';

export type Product = 'MS' | 'HSD';
export type Mark = 'ok' | 'short' | 'excess' | '';

export const TANKS = [
  { id: 't1', name: 'Tank 1', product: 'MS' as Product, book: 6420 },
  { id: 't2', name: 'Tank 2', product: 'HSD' as Product, book: 3180 },
  { id: 't3', name: 'Tank 3', product: 'HSD' as Product, book: 9050 },
];
export const PURCHASES = [
  {
    id: 'p1',
    no: 'IOCL/24/88213',
    date: '9 Oct',
    product: 'MS' as Product,
    qty: 12000,
    density: 745.2,
  },
  {
    id: 'p3',
    no: 'IOCL/24/88417',
    date: '11 Oct',
    product: 'HSD' as Product,
    qty: 8000,
    density: 831.9,
  },
];
export const TOLERANCE = 3;
export const PRODUCT_NAME: Record<Product, string> = { MS: 'Petrol', HSD: 'Diesel' };

export interface Line {
  product: Product;
  tankId: string;
  before: string;
  density: string;
  afterDip: boolean;
  after: string;
  sales: string;
}
export interface Chamber {
  qty: string;
  line: number;
  seal: boolean;
  mark: Mark;
  emptied: boolean;
}
export interface Visit {
  id: string;
  tanker: string;
  driver: string;
  purchaseIds: string[];
  lines: Line[];
  checkChambers: boolean;
  chambers: Chamber[];
  start: string;
  end: string;
  stage: 'arrived' | 'saved';
}

export const lakh = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('en-IN')} L`;
export const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('en-IN')}`;

export const newLine = (product: Product): Line => ({
  product,
  tankId: TANKS.find((t) => t.product === product)!.id,
  before: '',
  density: '',
  afterDip: false,
  after: '',
  sales: '',
});

export const emptyVisit = (): Visit => ({
  id: `v${Date.now()}`,
  tanker: '',
  driver: '',
  purchaseIds: [],
  lines: [newLine('HSD')],
  checkChambers: false,
  chambers: [
    { qty: '4000', line: 0, seal: true, mark: '', emptied: false },
    { qty: '4000', line: 0, seal: true, mark: '', emptied: false },
  ],
  start: '',
  end: '',
  stage: 'arrived',
});

/** Everything the screens show, derived from one Visit. */
export function derive(v: Visit) {
  const purchases = PURCHASES.filter((p) => v.purchaseIds.includes(p.id));
  const lines = v.lines.map((l, i) => {
    const tank = TANKS.find((t) => t.id === l.tankId)!;
    const p = purchases.find((x) => x.product === l.product);
    const dd = p && l.density ? +(Number(l.density) - p.density).toFixed(1) : null;
    const received =
      l.afterDip && l.after && l.before
        ? Number(l.after) - Number(l.before) + Number(l.sales || 0)
        : null;
    const ch = v.checkChambers ? v.chambers.filter((c) => c.line === i) : [];
    return {
      i,
      tank,
      label: `${tank.name} · ${l.product}`,
      purchase: p,
      densityDiff: dd,
      densityOut: dd != null && Math.abs(dd) > TOLERANCE,
      received,
      short: ch.some((c) => c.mark === 'short' || !c.seal),
      notEmptied: v.end !== '' && ch.some((c) => !c.emptied),
    };
  });
  const invoices = purchases.map((p) => {
    const ls = lines.filter((l) => l.purchase?.id === p.id);
    const pending = ls.some((l) => l.received == null);
    const received = pending ? null : ls.reduce((a, l) => a + (l.received ?? 0), 0);
    return { p, received, diff: received == null ? null : received - p.qty };
  });
  const unlinked = [...new Set(v.lines.map((l) => l.product))].filter(
    (pr) => !purchases.some((p) => p.product === pr),
  );
  const flags = [
    ...lines
      .filter((l) => l.densityOut)
      .map((l) => `Density ${signed(l.densityDiff!)} on ${l.label}`),
    ...lines.filter((l) => l.short).map((l) => `Tanker short / seal on ${l.label}`),
    ...lines.filter((l) => l.notEmptied).map((l) => `Chamber not emptied (${l.label})`),
  ];
  return {
    purchases,
    lines,
    invoices,
    unlinked,
    flags,
    pending: lines.some((l) => l.received == null),
  };
}
export type Derived = ReturnType<typeof derive>;

export function useVisit(initial?: Visit) {
  const [v, setV] = useState<Visit>(initial ?? emptyVisit);
  const d = useMemo(() => derive(v), [v]);
  const set = (patch: Partial<Visit>) => setV((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<Line>) =>
    setV((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const setChamber = (i: number, patch: Partial<Chamber>) =>
    setV((x) => ({ ...x, chambers: x.chambers.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const togglePurchase = (id: string) =>
    setV((x) => {
      if (x.purchaseIds.includes(id))
        return { ...x, purchaseIds: x.purchaseIds.filter((p) => p !== id) };
      const prod = PURCHASES.find((p) => p.id === id)!.product;
      return {
        ...x,
        purchaseIds: [
          ...x.purchaseIds.filter((p) => PURCHASES.find((q) => q.id === p)!.product !== prod),
          id,
        ],
      };
    });
  return { v, d, set, setLine, setChamber, togglePurchase, setV };
}
export type VisitApi = ReturnType<typeof useVisit>;

export const SEED: Visit[] = [
  {
    ...emptyVisit(),
    id: 'seed1',
    tanker: 'KL-07-CB-4412',
    driver: 'Suresh',
    purchaseIds: ['p1'],
    lines: [
      {
        ...newLine('MS'),
        before: '4210',
        density: '744.8',
        afterDip: true,
        after: '16140',
        sales: '0',
      },
    ],
    start: '10:05',
    end: '10:40',
    stage: 'saved',
  },
  {
    ...emptyVisit(),
    id: 'seed2',
    tanker: 'KL-07-CC-1190',
    driver: 'Anil',
    purchaseIds: [],
    lines: [
      { ...newLine('HSD'), tankId: 't2', before: '2950', density: '836.1' },
      { ...newLine('HSD'), tankId: 't3', before: '1080', density: '836.0' },
    ],
    start: '08:10',
    end: '',
    stage: 'arrived',
  },
];
