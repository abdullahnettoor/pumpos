function formatBusinessDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatStationDateTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone || 'Asia/Kolkata',
  });
}

export function historicalShiftMessage(businessDate: string, currentBusinessDate: string): string | null {
  return businessDate < currentBusinessDate
    ? `Working on ${formatBusinessDate(businessDate)}. Actions are being recorded on ${formatBusinessDate(currentBusinessDate)}.`
    : null;
}
