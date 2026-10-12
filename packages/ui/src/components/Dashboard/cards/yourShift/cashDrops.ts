/** Cash drops of the running shift: one line per handover that dropped cash. */
export interface ShiftCashDrop {
  key: string;
  at: string | null;
  duName: string;
  attendant: string;
  amount: number;
}

interface HandoverLike {
  id?: string | number;
  userId?: string | number | null;
  duId?: string | number | null;
  cashDrops?: string | number | null;
  createdAt?: string | null;
  duName?: string | null;
  attendantName?: string | null;
}

export function shiftCashDrops(handovers: readonly HandoverLike[] | null | undefined): {
  drops: ShiftCashDrop[];
  total: number;
} {
  const drops = (handovers ?? [])
    .map((h, i): ShiftCashDrop => ({
      key: String(h.id ?? `${h.userId}:${h.duId}:${i}`),
      at: h.createdAt ?? null,
      duName: h.duName ?? 'DU',
      attendant: h.attendantName ?? 'Attendant',
      amount: Number(h.cashDrops ?? 0),
    }))
    .filter((d) => d.amount > 0)
    .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  return { drops, total: drops.reduce((s, d) => s + d.amount, 0) };
}
