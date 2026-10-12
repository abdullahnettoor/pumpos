import React from 'react';
import { MoneyCard } from '../cards/MoneyCard.js';
import { ReceivablesPayablesCard } from '../cards/ReceivablesPayablesCard.js';
import { TodayInOfficeCard } from '../cards/TodayInOfficeCard.js';
import { YourShiftCard } from '../cards/YourShiftCard.js';

/** Third column: Money (Owner/Manager/Accountant) or Your shift (Staff, in Money's place) (#506). */
export const MoneyColumn: React.FC = () => (
  <>
    <MoneyCard />
    <ReceivablesPayablesCard />
    <TodayInOfficeCard />
    <YourShiftCard />
  </>
);
