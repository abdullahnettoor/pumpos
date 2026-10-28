import React from 'react';
import { Button, DatePickerButton, Icon } from '../../pump-ds/index.js';
import { addDays } from '../../utils/cashBook.js';

export interface DayPickerProps {
  /** The day shown, `YYYY-MM-DD`. */
  value: string;
  onChange: (date: string) => void;
  /** The latest day the picker reaches (today), `YYYY-MM-DD`. */
  max: string;
  /** Accessible name of the date button ("Cash book date"). */
  'aria-label': string;
}

/**
 * Day picker for a report of one day (#530, #532): Prev · date · Next ·
 * Today. The date is a button reading `Sun 11 Oct 2026` that opens a calendar
 * (#603), never the native "11/10/2026". Today is always there, disabled on
 * today. It never goes past `max`. Sits in the `range` slot of a
 * `ControlBar`, directly above what it drives.
 */
export const DayPicker: React.FC<DayPickerProps> = ({
  value,
  onChange,
  max,
  'aria-label': ariaLabel,
}) => (
  <>
    <Button
      variant="secondary"
      size="sm"
      leftIcon={<Icon name="chevron-left" size="sm" />}
      aria-label="Previous day"
      onClick={() => onChange(addDays(value, -1))}
    >
      Prev
    </Button>
    <DatePickerButton value={value} onChange={onChange} max={max} aria-label={ariaLabel} />
    <Button
      variant="secondary"
      size="sm"
      rightIcon={<Icon name="chevron-right" size="sm" />}
      aria-label="Next day"
      disabled={value >= max}
      onClick={() => {
        if (value < max) onChange(addDays(value, 1));
      }}
    >
      Next
    </Button>
    <Button variant="secondary" size="sm" disabled={value === max} onClick={() => onChange(max)}>
      Today
    </Button>
  </>
);
