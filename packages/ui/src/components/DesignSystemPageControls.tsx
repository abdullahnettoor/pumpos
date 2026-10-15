import React, { useState } from 'react';
import {
  ControlBar,
  DateRangeMenu,
  ExportMenu,
  FilterChips,
  KpiStrip,
  KpiTile,
  SearchInput,
  SectionHeader,
  SegmentedControl,
  Select,
  type DateRange,
} from '../pump-ds/index.js';
import { InfoTip } from './primitives/InfoTip.js';

/**
 * Design System › Page controls (#567): the shared pieces every page uses to
 * place its controls and figures, shown in the two owner-approved layouts.
 * Mock data in memory; "today" is fixed at Wed 14 Oct 2026 so the dates read
 * the same on every run. Switch the app theme to see dark.
 */

const NOW = new Date('2026-10-14T06:30:00.000Z');
const CLOCK = { timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' };
const noop = () => undefined;

const Block: React.FC<{ title: string; note: string; children: React.ReactNode }> = ({
  title,
  note,
  children,
}) => (
  <section className="mb-10">
    <h2 className="text-[15px] font-semibold text-ink-strong">{title}</h2>
    <p className="mb-3 mt-1 max-w-[680px] text-[12px] leading-relaxed text-ink-muted">{note}</p>
    <div className="flex flex-col gap-3.5 rounded-card border border-border-soft bg-canvas p-5">
      {children}
    </div>
  </section>
);

const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[12px] font-medium text-ink-muted">{children}</div>
);

const TablePlaceholder: React.FC<{ rows: string }> = ({ rows }) => (
  <div className="rounded-card border border-border-soft bg-surface px-4 py-6 text-center text-[13px] text-ink-muted">
    {rows}
  </div>
);

const Tip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <InfoTip label="How these figures are worked out">{children}</InfoTip>
);

const Search: React.FC<{ placeholder: string }> = ({ placeholder }) => {
  const [q, setQ] = useState('');
  return (
    <div className="w-[220px]">
      <SearchInput
        inputSize="sm"
        className="h-8"
        value={q}
        onChange={setQ}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
};

/** Layout A: one control bar drives everything below it, tiles included. */
const ReportLayout: React.FC = () => {
  const [range, setRange] = useState<DateRange>({ from: '2026-10-01', to: '2026-10-14' });
  const [cmp, setCmp] = useState<'prev' | 'year' | 'none'>('prev');
  return (
    <>
      <ControlBar
        range={
          <DateRangeMenu
            value={range}
            onChange={setRange}
            clock={CLOCK}
            now={NOW}
            aria-label="Report period"
          />
        }
        filters={
          <SegmentedControl
            aria-label="Compare with"
            value={cmp}
            onChange={setCmp}
            options={[
              { value: 'prev', label: 'vs previous period' },
              { value: 'year', label: 'vs last year' },
              { value: 'none', label: 'No comparison' },
            ]}
          />
        }
        exportMenu={<ExportMenu onPdf={noop} onCsv={noop} onPrint={noop} />}
        info={<Tip>Gross margin is by sales day. Expenses and other income are by entry date.</Tip>}
      />
      <KpiStrip>
        <KpiTile
          label="Revenue"
          value="₹87,57,000"
          delta={{ value: '6%', direction: 'up' }}
          hint="vs Sep, same days"
        />
        <KpiTile label="Gross margin" value="₹6,63,600" hint="7.6% of revenue" />
        <KpiTile
          label="Operating expenses"
          value="₹93,940"
          delta={{ value: '5%', direction: 'up', neutral: true }}
          hint="vs Sep, same days"
        />
        <KpiTile
          label="Net profit"
          value="₹5,69,660"
          delta={{ value: '6%', direction: 'up' }}
          hint="vs Sep, same days"
        />
      </KpiStrip>
      <TablePlaceholder rows="Profit & loss lines for the range" />
    </>
  );
};

/** Layout B, ledger: fixed tiles on top; the controls head the table they filter. */
const LedgerLayout: React.FC = () => {
  const [range, setRange] = useState<DateRange>({ from: '2026-10-01', to: '2026-10-14' });
  const [category, setCategory] = useState('');
  return (
    <>
      <KpiStrip>
        <KpiTile label="Spent today" scope="today" value="₹19,090.00" hint="2 entries" />
        <KpiTile
          label="Spent this month"
          scope={{ month: '2026-10' }}
          value="₹31,475.00"
          hint="6 entries"
        />
        <KpiTile
          label="Paid from cash"
          scope={{ month: '2026-10' }}
          value="₹23,075.00"
          hint="Cash in hand + petty"
        />
        <KpiTile
          label="Paid from bank / owner"
          scope={{ month: '2026-10' }}
          value="₹8,400.00"
          hint="Bank + owner"
        />
      </KpiStrip>
      <SectionHeader
        title="Expense ledger"
        subtitle="7 entries"
        controls={{
          range: (
            <DateRangeMenu
              value={range}
              onChange={setRange}
              clock={CLOCK}
              now={NOW}
              aria-label="Ledger period"
            />
          ),
          search: <Search placeholder="Search description, category…" />,
          filters: (
            <Select
              inputSize="sm"
              className="h-8 min-w-[170px]"
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              <option>Electricity</option>
              <option>Repairs &amp; maintenance</option>
              <option>Staff welfare</option>
              <option>Stationery</option>
              <option>Generator diesel</option>
            </Select>
          ),
          info: (
            <Tip>
              Expenses are office records, dated by entry date. Voided entries stay visible and are
              left out of totals.
            </Tip>
          ),
        }}
      />
      <TablePlaceholder rows="Expense rows · Total excl. voided" />
    </>
  );
};

type CustomerFilter = 'all' | 'overdue' | 'over-limit' | 'paid';

/** Layout B, balance list: no period, so the tiles say Now and the chips filter rows. */
const BalanceLayout: React.FC = () => {
  const [filter, setFilter] = useState<CustomerFilter>('all');
  return (
    <>
      <KpiStrip>
        <KpiTile label="Receivable" scope="now" value="₹3,82,711.00" hint="6 customers owe" />
        <KpiTile
          label="Overdue"
          scope="now"
          alert="warning"
          value="₹1,08,750.00"
          hint="3 customers, oldest 41 days"
        />
        <KpiTile
          label="Over credit limit"
          scope="now"
          alert="danger"
          value="1"
          hint="RTC Depot 4 · ₹62,000 over"
        />
        <KpiTile
          label="Collected"
          scope={{ month: '2026-10' }}
          value="₹3,18,400.00"
          hint="₹25,000 today"
        />
      </KpiStrip>
      <SectionHeader
        title="Credit customers"
        subtitle="8 of 8"
        controls={{
          search: <Search placeholder="Search customers…" />,
          filters: (
            <FilterChips
              aria-label="Customer status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: 8 },
                { value: 'overdue', label: 'Overdue', count: 3, status: 'overdue' },
                { value: 'over-limit', label: 'Over limit', count: 1, status: 'over-limit' },
                { value: 'paid', label: 'Paid up', count: 1 },
              ]}
            />
          ),
        }}
      />
      <TablePlaceholder rows="Customer rows · Total due" />
    </>
  );
};

const VOCABULARY: Array<[string, string, string]> = [
  [
    'Tabs',
    'Sections of a page: different data or questions.',
    'A different view of the same rows.',
  ],
  [
    'Segmented',
    '2–4 views of the same data (Cash | Bank, vs previous | vs last year).',
    'Filtering rows, or picking from 5+ options.',
  ],
  [
    'Filter chips',
    'Row filters with counts, shown before the click.',
    'Categories or long lists (use a select).',
  ],
  ['Select', 'One of 5+ values: category, account, product.', 'Two or three choices.'],
  [
    'Date range',
    'The one-button DateRangeMenu, above what it dates. Applies at once.',
    'A fixed-period tile (give the tile its period chip instead).',
  ],
  [
    'Primary button',
    'The one main action, top right of the page.',
    'Filters, exports, secondary actions.',
  ],
  [
    'Export menu · info tip',
    'The right end of the control bar, in that order.',
    'The page header.',
  ],
];

const Vocabulary: React.FC = () => (
  <dl className="grid grid-cols-[180px_1fr_1fr] overflow-hidden rounded-card border border-border-soft bg-surface text-[12px]">
    <dt className="bg-surface-alt px-3 py-2 font-semibold text-ink-muted">Control</dt>
    <dd className="bg-surface-alt px-3 py-2 font-semibold text-ink-muted">Use for</dd>
    <dd className="bg-surface-alt px-3 py-2 font-semibold text-ink-muted">Not for</dd>
    {VOCABULARY.map(([name, use, not]) => (
      <React.Fragment key={name}>
        <dt className="border-t border-border-soft px-3 py-2 font-semibold text-ink-strong">
          {name}
        </dt>
        <dd className="border-t border-border-soft px-3 py-2 text-ink-default">{use}</dd>
        <dd className="border-t border-border-soft px-3 py-2 text-ink-muted">{not}</dd>
      </React.Fragment>
    ))}
  </dl>
);

/** Each piece on its own. */
const Pieces: React.FC = () => {
  const [range, setRange] = useState<DateRange>({ from: '2026-10-08', to: '2026-10-14' });
  const [chip, setChip] = useState<CustomerFilter>('overdue');
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Caption>DateRangeMenu · presets with their dates, custom From/To, instant apply</Caption>
        <div>
          <DateRangeMenu value={range} onChange={setRange} clock={CLOCK} now={NOW} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Caption>FilterChips · counts in their status tone</Caption>
        <FilterChips
          aria-label="Status filter example"
          value={chip}
          onChange={setChip}
          options={[
            { value: 'all', label: 'All', count: 8 },
            { value: 'overdue', label: 'Overdue', count: 3, status: 'overdue' },
            { value: 'over-limit', label: 'Over limit', count: 1, status: 'over-limit' },
            { value: 'paid', label: 'Paid up', count: 1 },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Caption>ExportMenu · an item shows only when its callback is passed</Caption>
        <div className="flex gap-3">
          <ExportMenu onPdf={noop} onCsv={noop} onPrint={noop} />
          <ExportMenu onPrint={noop} aria-label="Export (print only)" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Caption>
          KpiTile · a chip only where periods differ, none on a balance; alert as the only colour
        </Caption>
        <KpiStrip>
          <KpiTile
            label="Spent"
            scope={{ month: '2026-10' }}
            value="₹31,475.00"
            delta={{ value: '8%', direction: 'up', neutral: true }}
            hint="vs Sep, same days"
          />
          <KpiTile label="Collected" scope="today" value="₹25,000.00" hint="4 entries" />
          <KpiTile label="Overdue" scope="now" alert="warning" value="₹1,08,750.00" />
          <KpiTile label="Net position" scope="now" alert="danger" value="−₹4,200.00" />
        </KpiStrip>
      </div>
    </div>
  );
};

export const PageControlsShowcase: React.FC = () => (
  <div>
    <Block
      title="Layout A · reports"
      note="One ControlBar under the tabs drives everything below it, tiles included; the bar names the period, so the tiles carry none. Order: range · search · filters · (space) · actions · export · info tip. The actions slot holds buttons that act only on what sits below the bar (Add entry on one account's statement); page actions stay in the Page Frame."
    >
      <ReportLayout />
    </Block>
    <Block
      title="Layout B · ledgers"
      note="Fixed tiles on top, each naming its own period (Today · Oct). The controls sit in the SectionHeader of the table they filter."
    >
      <LedgerLayout />
    </Block>
    <Block
      title="Layout B · balance lists"
      note="Balances have no period: the tiles say Now. Filter chips with counts split the rows. Amber and red only mark a problem."
    >
      <BalanceLayout />
    </Block>
    <Block
      title="The pieces"
      note="Keyboard: the range menu opens on ↓, Enter or Space; ↑/↓, Home and End move; Escape closes and returns focus. Chips move with ←/→."
    >
      <Pieces />
    </Block>
    <Block title="Control vocabulary" note="One job per control, so pages read the same.">
      <Vocabulary />
    </Block>
  </div>
);
