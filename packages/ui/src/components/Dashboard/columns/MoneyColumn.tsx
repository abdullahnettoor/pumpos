import React from 'react';
import { MoneyCard } from '../cards/MoneyCard.js';
import { ReceivablesPayablesCard } from '../cards/ReceivablesPayablesCard.js';
import { TodayInOfficeCard } from '../cards/TodayInOfficeCard.js';

/** Third column: Money (Sales so far + trend, To collect / To pay, Today in the office) (#506). */
export const MoneyColumn: React.FC = () => (
  <>
    <MoneyCard />
    <ReceivablesPayablesCard />
    <TodayInOfficeCard />
  </>
);
