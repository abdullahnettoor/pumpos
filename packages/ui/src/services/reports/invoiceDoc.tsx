import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { C, s, TableView, LetterheadBand, inr, fmtDateTime, type Col, type Cell, type Letterhead } from './shiftSummaryDoc.js';

export interface InvoiceLineSnapshot {
  productId: string;
  name: string;
  hsnCode: string | null;
  taxCategory: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableAmount: number;
  gstRate: number | null;
  vatRate: number | null;
  cessRate: number | null;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  cess: number;
  lineTotal: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issuedDate: string;
  financialYear?: string;
  buyerName: string | null;
  buyerGstin: string | null;
  buyerStateCode: string | null;
  interState: boolean;
  taxableAmount: string | number;
  cgstTotal: string | number;
  sgstTotal: string | number;
  igstTotal: string | number;
  vatTotal: string | number;
  cessTotal: string | number;
  roundOff: string | number;
  totalAmount: string | number;
  snapshotData: {
    lines: InvoiceLineSnapshot[];
    interState: boolean;
    supplierGstin: string | null;
    supplierStateCode: string | null;
    placeOfSupply: string | null;
  };
}

export interface InvoiceDocProps {
  invoice: InvoiceData;
  stationName?: string;
  letterhead?: Letterhead;
  paper?: 'A4' | 'LETTER';
}

const n = (v: string | number | null | undefined) => Number(v ?? 0);

// --- Amount in words (Indian numbering) ---------------------------------------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (x: number): string => (x < 20 ? ONES[x] : TENS[Math.floor(x / 10)] + (x % 10 ? ' ' + ONES[x % 10] : ''));
const three = (x: number): string =>
  Math.floor(x / 100) ? ONES[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x % 100);

export function amountInWords(amount: number): string {
  const num = Math.round(amount);
  if (num === 0) return 'Zero';
  let words = '';
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  if (crore) words += two(crore) + ' Crore ';
  if (lakh) words += two(lakh) + ' Lakh ';
  if (thousand) words += two(thousand) + ' Thousand ';
  if (rest) words += three(rest);
  return words.trim();
}

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <View style={{ marginBottom: 3 }}>
    <Text style={{ fontSize: 7, color: C.muted }}>{label}</Text>
    <Text style={{ fontSize: 9, color: C.ink, fontWeight: 700, marginTop: 1 }}>{value || '—'}</Text>
  </View>
);

const SummaryRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
    <Text style={{ fontSize: strong ? 9 : 8.5, color: strong ? C.ink : C.body, fontWeight: strong ? 700 : 400 }}>{label}</Text>
    <Text style={{ fontSize: strong ? 9.5 : 8.5, color: strong ? C.ink : C.body, fontFamily: 'IBM Plex Mono', fontWeight: strong ? 700 : 400 }}>{value}</Text>
  </View>
);

/**
 * B2B GST tax invoice PDF (Phase T4). Reuses the shared Phase-R react-pdf kit
 * (letterhead band, generic table, mono fonts). Renders priced line items from
 * the immutable invoice snapshot, the CGST/SGST (intra) or IGST (inter) split,
 * round-off, and the amount in words. Supplier identity comes from the snapshot.
 */
export const InvoiceDoc: React.FC<InvoiceDocProps> = ({ invoice, stationName, letterhead, paper = 'A4' }) => {
  const inter = invoice.interState;
  const lines = invoice.snapshotData?.lines ?? [];
  const showCess = n(invoice.cessTotal) > 0;
  const showVat = n(invoice.vatTotal) > 0;

  const cols: Col[] = [
    { header: '#', flex: 0.5 },
    { header: 'Item / HSN', flex: 3, strong: true },
    { header: 'Qty', flex: 1, align: 'right', mono: true },
    { header: 'Rate', flex: 1.3, align: 'right', mono: true },
    { header: 'Taxable', flex: 1.5, align: 'right', mono: true },
    { header: 'Tax %', flex: 1, align: 'right', mono: true },
    { header: 'Tax Amt', flex: 1.4, align: 'right', mono: true },
    { header: 'Amount', flex: 1.5, align: 'right', mono: true, strong: true },
  ];

  const rows: Cell[][] = lines.map((l, i) => {
    const taxPct = l.taxCategory === 'FUEL_VAT' ? n(l.vatRate) : n(l.gstRate);
    const taxAmt = l.cgst + l.sgst + l.igst + l.vat + l.cess;
    return [
      { text: String(i + 1) },
      { text: `${l.name}${l.hsnCode ? `  (HSN ${l.hsnCode})` : ''}` },
      { text: String(l.quantity) },
      { text: inr(l.unitPrice) },
      { text: inr(l.taxableAmount) },
      { text: taxPct ? `${taxPct}%` : '—' },
      { text: inr(taxAmt) },
      { text: inr(l.lineTotal) },
    ];
  });

  return (
    <Document>
      <Page size={paper} style={s.page}>
        <LetterheadBand title="TAX INVOICE" stationName={stationName} letterhead={letterhead} />

        {/* Invoice + buyer meta */}
        <View style={[s.metaBox, { justifyContent: 'space-between' }]}>
          <View style={{ width: '48%' }}>
            <Field label="INVOICE NO." value={invoice.invoiceNumber} />
            <Field label="INVOICE DATE" value={invoice.issuedDate} />
            <Field label="PLACE OF SUPPLY" value={invoice.snapshotData?.placeOfSupply || invoice.buyerStateCode} />
            <Field label="SUPPLY TYPE" value={inter ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'} />
          </View>
          <View style={{ width: '48%' }}>
            <Field label="BILL TO" value={invoice.buyerName} />
            <Field label="BUYER GSTIN" value={invoice.buyerGstin} />
            <Field label="STATE CODE" value={invoice.buyerStateCode} />
          </View>
        </View>

        {/* Line items */}
        <Text style={s.h2}>LINE ITEMS</Text>
        <TableView
          columns={cols}
          rows={rows}
          total={[
            { text: '' }, { text: 'TOTAL' }, { text: '' }, { text: '' },
            { text: inr(invoice.taxableAmount), color: C.ink },
            { text: '' },
            { text: inr(n(invoice.cgstTotal) + n(invoice.sgstTotal) + n(invoice.igstTotal) + n(invoice.vatTotal) + n(invoice.cessTotal)), color: C.ink },
            { text: inr(invoice.totalAmount), color: C.green },
          ]}
        />

        {/* Amount in words + tax summary */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
          <View style={{ width: '52%' }}>
            <Text style={{ fontSize: 7, color: C.muted }}>AMOUNT IN WORDS</Text>
            <Text style={{ fontSize: 9, color: C.ink, fontWeight: 700, marginTop: 2 }}>
              Rupees {amountInWords(n(invoice.totalAmount))} Only
            </Text>
          </View>
          <View style={{ width: '42%', borderWidth: 0.5, borderColor: C.line, borderRadius: 6, padding: 10 }}>
            <SummaryRow label="Taxable Value" value={inr(invoice.taxableAmount)} />
            {inter ? (
              <SummaryRow label="IGST" value={inr(invoice.igstTotal)} />
            ) : (
              <>
                <SummaryRow label="CGST" value={inr(invoice.cgstTotal)} />
                <SummaryRow label="SGST" value={inr(invoice.sgstTotal)} />
              </>
            )}
            {showVat ? <SummaryRow label="VAT" value={inr(invoice.vatTotal)} /> : null}
            {showCess ? <SummaryRow label="Cess" value={inr(invoice.cessTotal)} /> : null}
            {n(invoice.roundOff) !== 0 ? <SummaryRow label="Round Off" value={inr(invoice.roundOff)} /> : null}
            <View style={{ borderTopWidth: 0.5, borderTopColor: C.line, marginTop: 4, paddingTop: 2 }}>
              <SummaryRow label="Grand Total" value={inr(invoice.totalAmount)} strong />
            </View>
          </View>
        </View>

        <View style={s.signRow}>
          <Text style={s.sign}>Received in good order</Text>
          <Text style={s.sign}>For {letterhead?.legalName || stationName || 'PumpOS'}{'\n'}Authorised Signatory</Text>
        </View>

        <View style={s.foot} fixed>
          <Text>Computer-generated tax invoice{invoice.financialYear ? ` \u2022 FY ${invoice.financialYear}` : ''}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};
