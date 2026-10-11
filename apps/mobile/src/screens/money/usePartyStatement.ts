import { useState } from 'react';
import type { RangedPartyLedger, Station } from '@pump/shared';
import type { PartyKind, PartyStatementInput } from '@pump/ui';
import { buildStatementPdf } from './buildStatementPdf.js';
import { useCustomerStatementData, useSupplierStatementData } from './useMoneyData.js';
import { useStatementRange, type StatementRangeState } from './useStatementRange.js';

interface Input {
  kind: PartyKind;
  partyId: string;
  /** Who the PDF is for (see `customerStatementParty` / `supplierStatementParty`). */
  party: PartyStatementInput['party'];
  station: Station | null | undefined;
  /** The party's balance on record: shown until the ranged ledger brings its own closing balance. */
  balance: number;
}

export interface PartyStatementState {
  kind: PartyKind;
  balance: number;
  range: StatementRangeState;
  ledger: RangedPartyLedger | null;
  isLoading: boolean;
  isError: boolean;
  /** A window reaching further back is on its way; `ledger` still holds the previous one. */
  isFetchingMore: boolean;
  refetch: () => unknown;
  filtering: boolean;
  setFiltering: (open: boolean) => void;
  /** Share / Download for the page's action bar. */
  share: ReturnType<typeof buildStatementPdf>['share'];
  download: ReturnType<typeof buildStatementPdf>['download'];
}

/**
 * Everything a party page's Statement needs, for a Customer or a Supplier alike:
 * which range is showing (one state for the screen and the PDF), the ranged ledger
 * for it, the Filter sheet's open state, and the Share / Download actions. The page
 * renders it with `<PartyStatement statement={...} />` and hands `share` / `download`
 * to its `DetailPage`.
 *
 * Both ledger queries are called (hooks cannot be conditional); the one for the
 * other kind gets an empty id, which disables it.
 */
export function usePartyStatement({
  kind,
  partyId,
  party,
  station,
  balance,
}: Input): PartyStatementState {
  const range = useStatementRange(station);
  const customer = useCustomerStatementData(kind === 'customer' ? partyId : '', range.range);
  const supplier = useSupplierStatementData(kind === 'supplier' ? partyId : '', range.range);
  const q = kind === 'customer' ? customer : supplier;
  const [filtering, setFiltering] = useState(false);
  const { share, download } = buildStatementPdf({
    kind,
    party,
    station,
    range: range.range,
    ledger: q.ledger,
    pending: q.isLoading || q.isFetchingMore || q.isError,
  });
  return { kind, balance, range, ...q, filtering, setFiltering, share, download };
}
