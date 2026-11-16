import type { Gstr3bData, TaxHeads } from '../gstr3bDoc.js';
import { r2 } from './common.js';
import { OCT_PRODUCT_PURCHASES } from './financeMonth.js';
import { GSTR1_SAMPLE } from './gstr1Sample.js';

const nil: TaxHeads = { igst: 0, cgst: 0, sgst: 0, cess: 0 };

const supplies = [...GSTR1_SAMPLE.b2b, ...GSTR1_SAMPLE.b2cs];
const outwardTax: TaxHeads = {
  igst: r2(supplies.reduce((a, s) => a + s.igst, 0)),
  cgst: r2(supplies.reduce((a, s) => a + s.cgst, 0)),
  sgst: r2(supplies.reduce((a, s) => a + s.sgst, 0)),
  cess: r2(supplies.reduce((a, s) => a + s.cess, 0)),
};
const outwardTaxable = r2(supplies.reduce((a, s) => a + s.taxable, 0));

const itcSources = OCT_PRODUCT_PURCHASES.map((p) => ({
  date: p.date,
  supplier: p.supplier,
  gstin: p.gstin,
  invoiceNo: p.invoiceNo,
  taxable: r2(p.lines.reduce((a, l) => a + l.taxable, 0)),
  cgst: r2(p.lines.reduce((a, l) => a + l.cgst, 0)),
  sgst: r2(p.lines.reduce((a, l) => a + l.sgst, 0)),
}));

const hsnSum = (pick: (h: (typeof GSTR1_SAMPLE.hsn)[number]) => boolean) => {
  const hs = GSTR1_SAMPLE.hsn.filter(pick);
  return {
    taxable: r2(hs.reduce((a, h) => a + h.taxable, 0)),
    cgst: r2(hs.reduce((a, h) => a + h.cgst, 0)),
    sgst: r2(hs.reduce((a, h) => a + h.sgst, 0)),
  };
};

export const GSTR3B_SAMPLE: Gstr3bData = {
  filters: GSTR1_SAMPLE.filters,
  outward: [
    {
      code: 'a',
      label: 'Outward taxable supplies (other than zero, nil rated, exempted)',
      detail: 'Product Sales + Income with GST',
      taxable: outwardTaxable,
      tax: outwardTax,
    },
    { code: 'b', label: 'Outward taxable supplies (zero rated)', taxable: 0, tax: nil },
    { code: 'c', label: 'Other outward supplies (nil rated, exempted)', taxable: 0, tax: nil },
    {
      code: 'd',
      label: 'Inward supplies (liable to reverse charge) — not supported yet',
      unsupported: true,
    },
    {
      code: 'e',
      label: 'Non-GST outward supplies — fuel (VAT)',
      detail: 'Petrol, Diesel, XP95 from nozzle readings, VAT inclusive',
      taxable: GSTR1_SAMPLE.fuelExcluded,
    },
  ],
  gstr1: { taxable: outwardTaxable, tax: outwardTax },
  itcAvailable: [
    {
      code: '(1)–(4)',
      label: 'Imports, reverse charge, ISD — not supported yet',
      unsupported: true,
    },
    {
      code: '(5)',
      label: 'All other ITC — product Purchases',
      tax: {
        igst: 0,
        cgst: r2(itcSources.reduce((a, s) => a + s.cgst, 0)),
        sgst: r2(itcSources.reduce((a, s) => a + s.sgst, 0)),
        cess: 0,
      },
    },
  ],
  itcReversed: [
    { code: '(1)', label: 'As per rules 38, 42 & 43 and section 17(5)', tax: nil },
    { code: '(2)', label: 'Others', tax: nil },
  ],
  itcSources,
  outputSources: [
    {
      label: 'Billed Sales invoiced to GSTIN customers',
      gstr1Table: '4A (B2B)',
      ...hsnSum((h) => h.tab === 'B2B'),
    },
    {
      label: 'Other Product Sales (billed and handover)',
      gstr1Table: '7 (B2CS)',
      ...hsnSum((h) => h.tab === 'B2C' && h.uqc === 'NOS'),
    },
    {
      label: 'Income with GST (scrap, rent)',
      gstr1Table: '7 (B2CS)',
      ...hsnSum((h) => h.tab === 'B2C' && h.uqc !== 'NOS'),
    },
  ],
};
