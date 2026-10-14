import { createContext, useContext } from 'react';

/** What every field of an Office Record drawer reads from the drawer. */
export interface OfficeRecordContextValue {
  stationId: string | null;
  /** Funding Account balances, only for roles that may see them. */
  balances: ReadonlyMap<string, number>;
  /** True while a save is in flight. */
  disabled: boolean;
  /** Today's Entry Date at the station (station timezone, no Day Start). */
  today: string;
  /** Today's Business Date (Day Start applied): a product purchase's default. */
  businessDate: string;
}

export const OfficeRecordContext = createContext<OfficeRecordContextValue>({
  stationId: null,
  balances: new Map(),
  disabled: false,
  today: '',
  businessDate: '',
});

export const useOfficeRecordContext = () => useContext(OfficeRecordContext);
