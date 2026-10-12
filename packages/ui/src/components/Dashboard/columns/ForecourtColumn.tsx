import React from 'react';
import { YourShiftCard } from '../cards/YourShiftCard.js';
import { TimelineCard } from '../cards/TimelineCard.js';
import { ForecourtCard } from '../cards/ForecourtCard.js';

/** Left column: Your shift (Staff) · Timeline · Forecourt. Add cards here. */
export const ForecourtColumn: React.FC = () => (
  <>
    <YourShiftCard />
    <TimelineCard />
    <ForecourtCard />
  </>
);
