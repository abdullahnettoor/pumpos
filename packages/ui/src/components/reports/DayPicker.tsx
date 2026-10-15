import React from 'react';
import { Button, Icon, Input } from '../../pump-ds/index.js';
import { addDays } from '../../utils/cashBook.js';

export interface DayPickerProps {
  /** The day shown, `YYYY-MM-DD`. */
  value: string;
  onChange: (date: string) => void;
  /** The latest day the picker reaches (today), `YYYY-MM-DD`. */
  max: string;
  /** Accessible name of the date field ("Cash book date"). */
  'aria-label': string;
}

/**
 * Day picker for a report of one day (#530, #532): Prev · date · Next, and
 * Today once the reader has stepped away from it. It never goes past `max`.
 * Sits in the `range` slot of a `ControlBar`, directly above what it drives.
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
    <div className="w-[150px]">
      <Input
        type="date"
        inputSize="sm"
        aria-label={ariaLabel}
        value={value}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
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
    {value !== max && (
      <Button variant="ghost" size="sm" onClick={() => onChange(max)}>
        Today
      </Button>
    )}
  </>
);
