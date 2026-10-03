/**
 * Home-page "Why PumpOS" and feature-grid content (#341).
 *
 * `comingSoon: true` renders the "Coming soon" badge. Shipping an item means
 * deleting its `comingSoon` line; nothing else changes.
 */
export interface HomeItem {
  title: string;
  body: string;
  href?: string;
  comingSoon?: true;
}

export const whyPumpos: HomeItem[] = [
  { title: 'Every DSM\'s drawer checked at handover', body: 'Each attendant hands over their own cash, card and UPI against their own dispenser. A shortage has a name beside it before the shift closes.' },
  { title: 'The day report stays as it was', body: 'Once the day is closed, the report is saved. Later entries never quietly change what you already signed off.' },
  { title: 'Every change on record', body: 'Each sale, expense and correction is logged as it happens, so you can trace who did what and when.' },
  { title: 'VAT on fuel, GST on lubes', body: 'Petrol and diesel carry VAT. Lubes and accessories carry GST, split into CGST/SGST or IGST by the customer\'s state.' },
];

export const features: HomeItem[] = [
  { title: 'Stock and dips', body: 'Tank dips against expected stock, with the variance and its reason recorded.', href: '/product#stock' },
  { title: 'Purchases', body: 'Fuel and product purchases that move stock the day they arrive.', href: '/product#stock' },
  { title: 'Credit and khata', body: 'Customer dues, credit sales and collections with a running balance.', href: '/product#owner' },
  { title: 'Ledger and P&L', body: 'Funding accounts, expenses, income and a profit and loss view.', href: '/product#reports' },
  { title: 'Reports with PDF export', body: 'Shift summaries and the daily sales report, saved and ready to print.', href: '/product#reports' },
  { title: 'Excel export', body: 'Download the daily report and ledgers as spreadsheets.', href: '/product#reports', comingSoon: true },
  { title: 'Attendant app in your phone\'s browser', body: 'Attendants record their handover from their phone. No app to install.', href: '/product#desktop' },
  { title: 'Tally export', body: 'Send vouchers to your accountant\'s Tally.', comingSoon: true },
  { title: 'GSTR returns', body: 'Prepare GST return data from your records.', comingSoon: true },
  { title: 'WhatsApp alerts', body: 'Shortages and dues sent to the owner on WhatsApp.', comingSoon: true },
  { title: 'Malayalam and Hindi', body: 'The app and reports in your language.', comingSoon: true },
];
