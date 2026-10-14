/**
 * Statement module: one row model for every ledger (customer, supplier, cash,
 * bank, owner, a Daily Cash Book account) and its two views, the screen
 * (`StatementView`) and the PDF (`statementDocProps` → `LedgerDoc`).
 *
 * Adapter (`adapters.ts`) → `buildStatement` (`model.ts`) → `statementLines`
 * (`lines.ts`) → `StatementView` | `statementDocProps`.
 */
export {
  NORMAL_SIDE,
  buildStatement,
  placeDate,
  rowDetail,
  type BuildStatementOptions,
  type DateBasis,
  type Side,
  type Statement,
  type StatementClock,
  type StatementEntry,
  type StatementKind,
  type StatementRow,
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
  statementLines,
  type StatementLine,
} from './lines.js';
export { statementDocProps, type StatementDocProps } from './pdf.js';
export { StatementView, type StatementViewProps } from './StatementView.js';
