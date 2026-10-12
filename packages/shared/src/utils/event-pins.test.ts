import { describe, expect, it } from 'vitest';
import { groupEventPins, PIN_MERGE_MINUTES, type PinEvent } from './event-pins.js';

const base = Date.parse('2026-10-09T06:00:00Z');
const min = (m: number) => base + m * 60_000;
const ev = (id: string, m: number, tone: PinEvent['tone'] = 'info', icon = 'i'): PinEvent => ({
  id,
  at: min(m),
  tone,
  icon,
  label: id,
});

describe('groupEventPins', () => {
  it('empty in, empty out', () => expect(groupEventPins([])).toEqual([]));

  it('window is 45 minutes', () => expect(PIN_MERGE_MINUTES).toBe(45));

  it('merges events less than 45 minutes apart', () => {
    const pins = groupEventPins([ev('a', 0), ev('b', 44)]);
    expect(pins).toHaveLength(1);
    expect(pins[0].count).toBe(2);
  });

  it('keeps events exactly 45 minutes apart separate', () => {
    expect(groupEventPins([ev('a', 0), ev('b', 45)])).toHaveLength(2);
  });

  it('sorts unsorted input and chains neighbours', () => {
    const pins = groupEventPins([ev('c', 80), ev('a', 0), ev('b', 40)]);
    expect(pins.map((p) => p.events.map((e) => e.id))).toEqual([['a', 'b', 'c']]);
  });

  it('takes icon and tone of the most severe event', () => {
    const [pin] = groupEventPins([
      ev('a', 0, 'success', 'ok'),
      ev('b', 5, 'danger', 'bang'),
      ev('c', 6, 'warning', 'warn'),
    ]);
    expect(pin).toMatchObject({ tone: 'danger', icon: 'bang', count: 3 });
  });

  it('ties go to the earliest event; pin is placed at the first event', () => {
    const [pin] = groupEventPins([ev('a', 0, 'warning', 'first'), ev('b', 5, 'warning', 'second')]);
    expect(pin.icon).toBe('first');
    expect(pin.at).toBe(min(0));
  });

  it('accepts ISO strings', () => {
    const pins = groupEventPins([
      { id: 'x', at: '2026-10-09T06:00:00Z', tone: 'info', icon: 'i', label: 'x' },
    ]);
    expect(pins[0].at).toBe(min(0));
  });
});
