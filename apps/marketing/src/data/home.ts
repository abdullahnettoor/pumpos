// Homepage copy and sample data. Every figure here is illustrative sample data,
// labelled "Sample data" where it appears on the page. Keep domain terms aligned
// with CONTEXT.md (attendant, Drawer, Handover, business day, DSR).

export type Tone = 'danger' | 'amber';

export interface Leak {
  kicker: string;
  title: string;
  who: string;
  sub: string;
  value: string;
  tone: Tone;
  body: string;
  rows: [string, string][];
  foot: string;
}

export const leaks: Leak[] = [
  {
    kicker: 'Cash · at handover', title: 'The drawer that came back short.', who: 'Anitha S · DU-2', sub: 'Evening shift', value: '−₹350', tone: 'danger',
    body: 'Every attendant closes their own drawer against their own dispenser. No pooled cash, no guessing.',
    rows: [['Opening float', '₹5,000'], ['Cash sales at DU-2', '₹1,26,450'], ['Cash drops to office', '− ₹10,000'], ['Expected in drawer', '₹1,21,450'], ['Declared at handover', '₹1,21,100']],
    foot: 'Flagged at handover, before the shift closes',
  },
  {
    kicker: 'Fuel · at the dip', title: 'The tank that read lower than the book.', who: 'HSD Tank 2', sub: 'Expected 14,220 L · Dip 14,202 L', value: '−18 L', tone: 'amber',
    body: 'Dips against expected stock, with the variance and its reason kept on record.',
    rows: [['Opening stock', '16,400 L'], ['Received (tanker)', '+ 4,000 L'], ['Sold by nozzle readings', '− 6,180 L'], ['Expected stock', '14,220 L'], ['Dip reading', '14,202 L']],
    foot: 'Reason recorded: temperature / evaporation',
  },
  {
    kicker: 'Credit · in the khata', title: 'The fleet account creeping up to its limit.', who: 'KSRTC Depot Aluva', sub: 'Limit ₹1,20,000', value: '₹1,12,800', tone: 'amber',
    body: 'Every credit sale and collection with the balance after each one. Disputes end at the statement.',
    rows: [['Balance on 1 Oct', '₹96,300'], ['Credit sales this week (5)', '+ ₹46,500'], ['Collection · NEFT', '− ₹30,000'], ['Outstanding now', '₹1,12,800'], ['Credit limit used', '94%']],
    foot: 'Near limit: ₹7,200 of credit left',
  },
];

export const dayClose: [string, string, string, 'ok' | 'variance'][] = [
  ['Nozzle readings', 'Opening → closing, per nozzle', 'Matched', 'ok'],
  ['Drawer handovers', 'Anitha S · DU-2 · −₹350', 'Variance', 'variance'],
  ['Tank dip', 'HSD Tank 2 · −18 L with reason', 'Variance', 'variance'],
  ['Fleet credit', 'KSRTC Depot Aluva · ₹1,12,800 due', 'Tracked', 'ok'],
];

export const dsrRows: [string, string][] = [
  ['Fuel by nozzle readings', '₹4,38,920'],
  ['Lubes & products', '₹6,240'],
  ['Credit sales (khata)', '− ₹38,500'],
  ['Card + UPI', '− ₹1,92,410'],
];

export const creditSteps = [
  { title: 'Start with what is owed.', body: 'Open a customer statement. See the outstanding balance, credit limit and last payment.' },
  { title: 'See exactly what came in.', body: 'A ₹15,000 bank collection is recorded against the customer. It lowers their dues without touching drawer cash.' },
  { title: 'See where every rupee came from.', body: 'The statement shows the collection and the ₹27,500 still outstanding. Earlier entries stay there to inspect.' },
  { title: 'Check it yourself. Wherever you are.', body: 'Open the customer’s recent entries on your phone. No need to ask someone for an update.' },
];

export const statement: [string, string, string, string][] = [
  ['28 Sep', 'Credit sale · HSD 120 L', '+ ₹11,400', '₹31,100'],
  ['01 Oct', 'Credit sale · HSD 120 L', '+ ₹11,400', '₹42,500'],
  ['03 Oct', 'Collection · Bank transfer', '− ₹15,000', '₹27,500'],
];

export const dayline: [string, string, string, string][] = [
  ['6:00', 'Manager', 'Opens the shift', 'Assigns each attendant a DU and an opening float. Opening readings carry over.'],
  ['6:05 – 14:00', 'Attendant', 'Sells from their DU', 'Cash, card and UPI. The manager takes cash drops to the office.'],
  ['14:00', 'Attendant', 'Hands over the drawer', 'Declares cash, card and UPI for their own drawer, from the phone on Pro or through the manager on Core. Shortage shows at once.'],
  ['15:00', 'Accountant', 'Keeps the office books', 'Collections, supplier payments, expenses, by entry date.'],
  ['22:30', 'Owner', 'Closes the day', 'Reads the DSR from anywhere. Once closed, it is saved and never recalculated.'],
];

// Coming-next items mirror issue #335; move one to the bento only when it ships.
export const comingNext = ['Tally export', 'GSTR-1 / 3B', 'Excel / CSV on every report', 'Credit limit at sale, aging, statement PDF', 'WhatsApp reminders', 'Balance sheet', 'Owner alerts', 'Malayalam, Hindi, Tamil, Telugu'];

export const compareRows: [string, string, string, string][] = [
  ['Whose drawer was short?', 'Found at month end, if at all', 'Shift total, pooled cash', 'Per attendant, per DU, at handover'],
  ["Can yesterday's report change today?", 'Any cell can be overwritten', 'Reports recalculate from live data', 'No. The DSR is saved at day close and never recalculated'],
  ['Where do fuel sales come from?', 'Typed in by hand', 'Manual bills plus readings', 'Nozzle readings only, opening carried over'],
  ['Who changed this entry, and when?', 'Nobody knows', 'Sometimes, for some screens', 'Every change logged with a name'],
  // PumpOS is online-first: there is no client write queue yet (AGENTS.md, Resilience Rules).
  ['What happens when the internet drops?', 'Paper keeps going', 'Screens stop or entries are lost', 'The desktop app stays open; entries resume when you reconnect'],
];

export const plans = [
  { name: 'Core', level: 'core', price: { monthly: 999, yearly: 9990 }, intro: { price: 0, label: 'for your first 3 months', then: 'then' } },
  { name: 'Pro', level: 'pro', price: { monthly: 1599, yearly: 15990 }, popular: true, footnote: "Pro price may vary with your station's configuration." },
  { name: 'Scale', level: 'scale', price: { monthly: null, yearly: null } },
];

// Logins are limited per plan; attendants without a login are not (issue #335 limits).
export const planFeatures = [
  // The first PRICING_KEY_ROWS rows show by default; the rest sit behind "Compare all features".
  { name: 'Logins: 3 on Core, 10 on Pro, custom on Scale', included: 'core', note: 'Owner, manager, accountant or attendant with phone access' },
  { name: 'Attendants without a login, unlimited', included: 'core' },
  { name: 'Shifts, nozzle readings and handovers', included: 'core' },
  { name: 'Attendant handover on the phone', included: 'pro' },
  { name: 'WhatsApp reminders and daily summary', included: 'pro', note: 'Coming next' },
  { name: 'Several stations under one login', included: 'scale' },
  { name: 'Stock, dips and purchases', included: 'core' },
  { name: 'Credit, collections and khata', included: 'core' },
  { name: 'Office books and P&L', included: 'core' },
  { name: 'Saved DSR, VAT and GST', included: 'core' },
  { name: 'Tally, GSTR and Excel export', included: 'core', note: 'Coming next' },
  { name: 'Customer statement link', included: 'pro', note: 'Coming next' },
  { name: 'Owner alerts on your phone', included: 'pro', note: 'Coming next' },
  { name: 'Attendance, advances and shortage recovery', included: 'pro', note: 'Coming next' },
  { name: 'Reports across stations', included: 'scale', note: 'Coming next' },
];
export const PRICING_KEY_ROWS = 6;

export const faqs: [string, string][] = [
  ['Does it work when the internet goes down?', 'PumpOS is online-first. The desktop app itself loads from your computer, so it stays open, but new entries need a connection to save. Saving entries offline is planned, not shipped.'],
  ['Do my attendants need smartphones or training?', 'No. On Core, attendants don’t need a login: the manager records each handover from the office. On Pro, attendants can hand over their own DU from a phone browser. Handover is one screen: cash, card and UPI. Nothing to install.'],
  ['Can I move my old registers and opening balances in?', 'Yes. During setup we enter your tanks, nozzles and last meter readings, opening stock, and each credit customer’s outstanding balance, so your first shift starts from where your notebook ended.'],
  ["Will it work with my accountant's Tally?", 'Not yet. Tally export is planned. Today you can download shift summaries and the DSR as PDF and send them to your accountant.'],
  ["Is my station's data private?", 'Each station’s records are kept separate from every other customer’s, and each person sees only what their role allows. Your data is yours; you can ask us for a copy at any time.'],
  ['How long does setup take?', 'A few minutes once your tank, nozzle, product and opening-balance details are ready. We do it with you, then stay with your team for the first shift closings.'],
  ['What does it cost after the first 3 months?', 'Core is ₹999 a month per station, or ₹9,990 a year (two months free). Pro is ₹1,599 a month, which can vary with your station’s setup. Attendants without a login are never counted.'],
  ['Does it work for my oil company?', 'Yes. Shifts, readings, drawers and dues work the same at every fuel station. You set up your own tanks, nozzles, products and prices, whichever company supplies you.'],
];
