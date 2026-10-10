import { generateStatementPdf, type PdfOutput, type StatementPdfData } from '@pump/ui';
import type { RangedPartyLedger, Station } from '@pump/shared';
import type { ActionSlot } from '../../ui/ActionBar.js';
import { statementPdfData } from '../../lib/money/statementPdf.js';
import type { DateRange } from '../../lib/money/statementRange.js';
import type { PartyKind } from '../../lib/money/statement.js';

interface Input {
  kind: PartyKind;
  party: StatementPdfData['party'];
  station: Station | null | undefined;
  /** The range the ledger below was asked for (what the screen shows). */
  range: DateRange;
  /** The ledger on screen; null until it arrives. */
  ledger: RangedPartyLedger | null;
  /** The ledger is not the settled answer for `range` yet (loading, failed, or a wider window on its way). */
  pending: boolean;
}

/**
 * Share and Download for a party page's Statement. Both print the ledger that is
 * on screen, over the range the Filter set, so the PDF is what the owner sees;
 * until that ledger has arrived for the range, the buttons wait.
 *
 * Share = the platform saver (the Web Share API with the file on a phone, a
 * download where it can't share files); Download = always a browser download.
 */
export function useStatementPdf({ kind, party, station, range, ledger, pending }: Input) {
  const disabled = pending || !ledger;
  const run = async (output: PdfOutput) => {
    if (!ledger) return;
    const data = statementPdfData({ kind, party, range, ledger, now: new Date() });
    await generateStatementPdf(station ?? null, data, output);
  };
  const share: ActionSlot = { onPress: () => run('save'), disabled };
  const download: ActionSlot = {
    onPress: () => run('download'),
    label: 'Download statement',
    disabled,
  };
  return { share, download };
}
