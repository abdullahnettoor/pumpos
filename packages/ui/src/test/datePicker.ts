import { fireEvent, screen, within } from '@testing-library/react';

/**
 * Test helpers for `DatePickerButton` (#609): the form date fields are a button
 * plus a month calendar, not a native `<input type="date">`, so a test picks a
 * day the way an operator does.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The picker button whose accessible name starts with `label` ("Entry date: Thu 15 Oct 2026"). */
export function datePicker(label: string, root: HTMLElement = document.body): HTMLButtonElement {
  return within(root).getByRole('button', {
    name: new RegExp(`^${escape(label)}: `),
  }) as HTMLButtonElement;
}

/** The `YYYY-MM-DD` a picker holds ('' when none). */
export function pickedDate(label: string, root?: HTMLElement): string {
  return datePicker(label, root).dataset.value ?? '';
}

/** The open calendar's day button for `iso`, after paging to its month (null if it can't be shown). */
export function calendarDay(iso: string): HTMLButtonElement | null {
  const popovers = screen.getAllByTestId('date-picker-popover');
  const pop = popovers[popovers.length - 1]!;
  for (let i = 0; i < 400; i++) {
    const day = pop.querySelector<HTMLButtonElement>(`[data-date="${iso}"]`);
    if (day) return day;
    const any = pop.querySelector<HTMLButtonElement>('[data-date]')!.dataset.date!;
    const step = within(pop).getByRole('button', {
      name: iso < any ? 'Previous month' : 'Next month',
    }) as HTMLButtonElement;
    if (step.disabled) return null;
    fireEvent.click(step);
  }
  return null;
}

/** Opens the picker named `label` and picks `iso` from its calendar. */
export function pickDate(label: string, iso: string, root?: HTMLElement): void {
  fireEvent.click(datePicker(label, root));
  const day = calendarDay(iso);
  if (!day) throw new Error(`${iso} cannot be shown in the ${label} calendar`);
  fireEvent.click(day);
}
