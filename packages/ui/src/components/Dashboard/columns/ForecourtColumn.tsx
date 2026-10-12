import React from 'react';
import { TimelineCard } from '../cards/TimelineCard.js';
import { ForecourtCard } from '../cards/ForecourtCard.js';

/** Left column: Timeline · Forecourt. Add cards here. */
export const ForecourtColumn: React.FC = () => (
  <>
    <TimelineCard />
    <ForecourtCard />
  </>
);
