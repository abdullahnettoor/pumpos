import React from 'react';
import { MoneyCard } from '../cards/MoneyCard.js';
import { YourShiftCard } from '../cards/YourShiftCard.js';

/** Third column: Money (Owner/Manager/Accountant) or Your shift (Staff, in Money's place). Add cards here. */
export const MoneyColumn: React.FC = () => (
  <>
    <MoneyCard />
    <YourShiftCard />
  </>
);
