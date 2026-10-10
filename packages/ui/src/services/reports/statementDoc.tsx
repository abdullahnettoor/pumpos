import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { C, s, Kpi, LetterheadBand, inr, fmtDateTime, type Letterhead } from './shiftSummaryDoc.js';
import {
  STATEMENT_PDF_WORDING,
  type StatementPdfData,
  type StatementPdfRow,
} from './statementPdf.js';

export interface StatementDocProps {
  data: StatementPdfData;
  stationName?: string;
  letterhead?: Letterhead;
  showLogo?: boolean;
  paper?: 'A4' | 'LETTER';
}

/** A signed rupee amount: `-₹1,200.00` (never `₹-1,200.00`). */
export const signedInr = (value: string | number): string => {
  const n = Number(value);
  return Number.isFinite(n) && n < 0 ? `-${inr(-n)}` : inr(n);
};

const COL = { date: 1.25, what: 3.3, debit: 1.5, credit: 1.5, balance: 1.75 };

const Head: React.FC<{ debit: string; credit: string }> = ({ debit, credit }) => (
  <View style={[s.tr, s.thRow]}>
    <Text style={[s.th, { flex: COL.date }]}>Date</Text>
    <Text style={[s.th, { flex: COL.what }]}>Particulars</Text>
    <Text style={[s.th, { flex: COL.debit, textAlign: 'right' }]}>{debit}</Text>
    <Text style={[s.th, { flex: COL.credit, textAlign: 'right' }]}>{credit}</Text>
    <Text style={[s.th, { flex: COL.balance, textAlign: 'right' }]}>Balance</Text>
  </View>
);

const Row: React.FC<{ row: StatementPdfRow; zebra: boolean }> = ({ row, zebra }) => (
  // A row never splits across pages.
  <View wrap={false} style={[s.tr, zebra ? s.zebra : {}]}>
    <Text style={[s.cell, { flex: COL.date }]}>{row.date}</Text>
    <View style={{ flex: COL.what, paddingVertical: 4, paddingHorizontal: 6 }}>
      <Text style={{ fontSize: 8.5, color: C.ink, fontWeight: 700 }}>{row.title}</Text>
      {row.detail ? (
        <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{row.detail}</Text>
      ) : null}
    </View>
    <Text style={[s.cellMono, { flex: COL.debit, textAlign: 'right' }]}>
      {row.debit ? signedInr(row.debit) : ''}
    </Text>
    <Text style={[s.cellMono, { flex: COL.credit, textAlign: 'right', color: C.success }]}>
      {row.credit ? signedInr(row.credit) : ''}
    </Text>
    <Text style={[s.cellMonoStrong, { flex: COL.balance, textAlign: 'right' }]}>
      {signedInr(row.balance)}
    </Text>
  </View>
);

/** A bold line of the statement that is not an entry: the opening or closing balance. */
const BalanceLine: React.FC<{ label: string; value: string; note?: string; top?: boolean }> = ({
  label,
  value,
  note,
  top,
}) => (
  <View
    wrap={false}
    style={[
      s.tr,
      {
        backgroundColor: C.surfaceAlt,
        borderTopWidth: top ? 1 : 0,
        borderTopColor: C.line,
        marginTop: top ? 2 : 0,
        marginBottom: top ? 0 : 2,
      },
    ]}
  >
    <View style={{ flex: COL.date + COL.what, paddingVertical: 5, paddingHorizontal: 6 }}>
      <Text style={{ fontSize: 8.5, color: C.ink, fontWeight: 700 }}>{label}</Text>
      {note ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{note}</Text> : null}
    </View>
    <View style={{ flex: COL.debit + COL.credit }} />
    <Text style={[s.cellMonoStrong, { flex: COL.balance, textAlign: 'right', paddingVertical: 5 }]}>
      {value}
    </Text>
  </View>
);

/**
 * Vector PDF statement of one customer or supplier over a date range: the
 * Station letterhead, who it is for, the range, the opening balance, every
 * entry with its running balance, and the closing balance. All balances are the
 * server's (see `statementPdf.ts`); the document only lays them out. Reuses the
 * shared report kit (letterhead, KPI tiles, table styles).
 */
export const StatementDoc: React.FC<StatementDocProps> = ({
  data,
  stationName,
  letterhead,
  showLogo = true,
  paper = 'A4',
}) => {
  const w = STATEMENT_PDF_WORDING[data.kind];
  const closing = Number(data.closingBalance);
  const closingNote = closing > 0 ? w.owed : closing < 0 ? w.advance : 'Settled';

  return (
    <Document>
      <Page size={paper} style={s.page}>
        <LetterheadBand
          title={w.title}
          stationName={stationName}
          letterhead={letterhead}
          showLogo={showLogo}
        />

        <View style={s.metaBox}>
          <View style={{ width: '58%' }}>
            <Text style={s.label}>{data.kind === 'customer' ? 'CUSTOMER' : 'SUPPLIER'}</Text>
            <Text style={s.val}>{data.party.name}</Text>
            {data.party.lines.map((line, i) => (
              <Text key={i} style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>
                {line}
              </Text>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>PERIOD</Text>
            <Text style={s.val}>{data.periodLabel}</Text>
            <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>
              {`${data.from} to ${data.to}`}
            </Text>
          </View>
        </View>

        <View style={[s.kpiRow, { marginTop: 10 }]}>
          <Kpi l="Opening balance" v={signedInr(data.openingBalance)} />
          <Kpi l={w.debit} v={signedInr(data.totalDebits)} />
          <Kpi l={w.credit} v={signedInr(data.totalCredits)} c={C.success} />
          <Kpi
            l="Closing balance"
            v={signedInr(data.closingBalance)}
            c={closing < 0 ? C.danger : C.ink}
          />
        </View>

        <Text style={s.h2}>STATEMENT OF ACCOUNT</Text>
        <Head debit={w.debit} credit={w.credit} />
        <BalanceLine label="Opening balance" value={signedInr(data.openingBalance)} />
        {data.rows.length === 0 ? (
          <Text style={{ fontSize: 9, color: C.muted, paddingVertical: 8, paddingHorizontal: 6 }}>
            No transactions in this period.
          </Text>
        ) : (
          data.rows.map((row, i) => <Row key={i} row={row} zebra={i % 2 === 1} />)
        )}
        <BalanceLine
          top
          label="Closing balance"
          note={closingNote}
          value={signedInr(data.closingBalance)}
        />

        <Text style={[s.sub, { marginTop: 10 }]}>
          {`${data.rows.length} ${data.rows.length === 1 ? 'entry' : 'entries'} \u2022 Generated ${fmtDateTime(data.generatedAt)}`}
        </Text>

        <View style={s.foot} fixed>
          <Text>Generated by PumpOS</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};
