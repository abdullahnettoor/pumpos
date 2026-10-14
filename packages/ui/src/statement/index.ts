/**
 * Statement module: one row model for every ledger (customer, supplier, cash,
 * bank, owner, a Daily Cash Book account) and its two views, the screen
 * (`StatementView`) and the PDF (`statementDocProps` → `LedgerDoc`).
 *
 * Adapter (`adapters.ts`) → `buildLedgerStatement` (`model.ts`) → `statementLines`
 * (`lines.ts`) → `StatementView` | `statementDocProps`.
 *
 * The model is `LedgerStatement` (built by `buildLedgerStatement` from
 * `LedgerStatementEntry` rows): the mobile app keeps its own `Statement` in
 * `apps/mobile/src/lib/money/statement.ts` until its screen and PDF move here together.
 */
export {
  NORMAL_SIDE,
  buildLedgerStatement,
  placeDate,
  rowDetail,
  type BuildLedgerStatementOptions,
  type DateBasis,
  type Side,
  type LedgerStatement,
  type StatementClock,
  type LedgerStatementEntry,
  type StatementKind,
  type LedgerStatementRow,
} from './model.js';
export { SOURCE_LABEL, sourceLabel } from './sources.js';
export {
  deltaOf,
  describeLedgerRow,
  moneyEntries,
  officeRecords,
  partyDateBasis,
  partyEntries,
  type LedgerRow,
  type MoneyEntryOptions,
  type MoneyMovement,
  type PartyKind,
} from './adapters.js';
export {
  CLOSING_LABEL,
  NO_ROWS_IN_PERIOD,
  OPENING_LABEL,
  STATEMENT_HEADERS,
  closingFigures,
  lineDate,
  statementDate,
  statementLines,
  type StatementLine,
} from './lines.js';
export { statementDocProps, type StatementDocProps } from './pdf.js';
export { NOT_RECONCILED_NOTE, StatementView, type StatementViewProps } from './StatementView.js';
