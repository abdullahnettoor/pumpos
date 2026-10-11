import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import {
  C,
  s,
  TableView,
  Kpi,
  LetterheadBand,
  inr,
  inr0,
  fmtDateTime,
  type Col,
  type Cell,
  type Letterhead,
} from './shiftSummaryDoc.js';

/** A signed rupee amount: `-₹1,200.00` (never `₹-1,200.00`). */
export const signedInr = (value: string | number): string => {
  const n = Number(value);
  return Number.isFinite(n) && n < 0 ? `-${inr(-n)}` : inr(n);
};

export interface LedgerDocRow {
  dateLabel: string;
  particulars: string;
  /** A muted second line under the particulars (a statement row's shift, vehicle, reference). */
  detail?: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerDocProps {
  /** Document title, e.g. "CUSTOMER LEDGER". */
  title: string;
  /** Account name / description shown in the sub-line. */
  entityName: string;
  periodLabel: string;
  debitLabel: string;
  creditLabel: string;
  balanceLabel: string;
  /** Chronological (oldest→newest) rows with running balance. */
  rows: LedgerDocRow[];
  totals: { debit: number; credit: number; balance: number };
  /** Identity and contact lines of the party, under the sub-line ("Fleet · FL-001", "GSTIN …"). */
  partyLines?: string[];
  /**
   * The account of one party (a customer or supplier statement): amounts print
   * exact and signed (`-₹1,200.00`), and a negative balance is an advance held,
   * not a shortfall, so it is not shown in the danger colour. Unset (the
   * desktop Unified Ledger): whole-rupee KPIs and a negative balance in red.
   */
  partyAccount?: boolean;
  /** What was owed before the first row: adds an opening balance line (and KPI). */
  opening?: number;
  /** Turns the totals line into a closing balance line, with `note` saying what it means. */
  closing?: { note?: string };
  stationName?: string;
  letterhead?: Letterhead;
  showLogo?: boolean;
  generatedAt?: string;
  paper?: 'A4' | 'LETTER';
}

/**
 * Vector PDF statement for any ledger entity (customer, supplier, cash, bank,
 * owner) — reuses the shared Phase-R react-pdf kit (letterhead, KPI tiles,
 * generic two-column-style table). Rows arrive already resolved + balanced by
 * `computeLedgerRows` so the PDF matches the on-screen `<LedgerView>` exactly.
 *
 * The optional `partyLines`, `partyAccount`, `opening`, `closing` and per-row
 * `detail` turn it into one customer's or supplier's account statement (the
 * mobile Share / Download, see `partyStatement.ts`); without them the document is
 * the desktop Unified Ledger's, unchanged (pinned by `ledgerDoc.test.tsx`).
 */
export const LedgerDoc: React.FC<LedgerDocProps> = ({
  title,
  entityName,
  periodLabel,
  debitLabel,
  creditLabel,
  balanceLabel,
  rows,
  totals,
  stationName,
  letterhead,
  showLogo = true,
  generatedAt,
  paper = 'A4',
  partyLines,
  partyAccount = false,
  opening,
  closing,
}) => {
  const cols: Col[] = [
    { header: 'Date', flex: 1.3, strong: true },
    { header: 'Particulars', flex: 2.8 },
    { header: debitLabel, flex: 1.4, align: 'right', mono: true },
    { header: creditLabel, flex: 1.4, align: 'right', mono: true },
    { header: balanceLabel, flex: 1.5, align: 'right', mono: true, strong: true },
  ];
  const money = partyAccount ? signedInr : inr;
  const kpiMoney = partyAccount ? signedInr : inr0;
  const cellRows: Cell[][] = rows.map((r) => [
    { text: r.dateLabel },
    { text: r.particulars, detail: r.detail },
    { text: r.debit ? money(r.debit) : '' },
    { text: r.credit ? money(r.credit) : '', color: r.credit ? C.success : undefined },
    { text: money(r.balance) },
  ]);
  const totalRow: Cell[] = [
    closing ? { text: 'CLOSING BALANCE', detail: closing.note } : { text: 'TOTALS' },
    { text: '' },
    { text: money(totals.debit) },
    { text: money(totals.credit), color: C.success },
    { text: money(totals.balance), color: C.ink },
  ];
  const leadRow: Cell[] | undefined =
    opening === undefined
      ? undefined
      : [
          { text: 'OPENING BALANCE' },
          { text: '' },
          { text: '' },
          { text: '' },
          { text: money(opening), color: C.ink },
        ];
  // A negative balance is a shortfall on the desktop ledger, an advance on a party's account.
  const balanceTone = totals.balance < 0 && !partyAccount ? C.danger : C.ink;

  return (
    <Document>
      <Page size={paper} style={s.page}>
        <LetterheadBand
          title={title}
          stationName={stationName}
          letterhead={letterhead}
          showLogo={showLogo}
        />
        <Text style={s.sub}>
          {entityName} {'\u2022'} {periodLabel}
          {generatedAt ? ` \u2022 Generated ${fmtDateTime(generatedAt)}` : ''}
        </Text>
        {(partyLines ?? []).map((line, i) => (
          <Text key={i} style={[s.sub, { marginTop: 2 }]}>
            {line}
          </Text>
        ))}

        <View style={s.kpiRow}>
          {opening !== undefined && <Kpi l="Opening balance" v={kpiMoney(opening)} />}
          <Kpi l={debitLabel} v={kpiMoney(totals.debit)} />
          <Kpi l={creditLabel} v={kpiMoney(totals.credit)} c={C.success} />
          <Kpi l={balanceLabel} v={kpiMoney(totals.balance)} c={balanceTone} />
        </View>

        <Text style={s.h2}>STATEMENT OF ACCOUNT</Text>
        {rows.length === 0 && opening === undefined ? (
          <Text style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
            No transactions in this period.
          </Text>
        ) : (
          <>
            <TableView columns={cols} rows={cellRows} total={totalRow} lead={leadRow} />
            {rows.length === 0 && (
              <Text style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
                No transactions in this period.
              </Text>
            )}
          </>
        )}

        <View style={s.foot} fixed>
          <Text>Generated by PumpOS</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};
