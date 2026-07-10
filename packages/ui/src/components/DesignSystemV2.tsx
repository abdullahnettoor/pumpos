import React, { useState } from 'react';
import { inr, formatQty } from '../utils/format.js';
// v2 styles live at the bottom of packages/ui/src/index.css under `.ds-v2` —
// scoped so they can't leak into product screens.

/**
 * Design System v2 — sandbox for a compact, sleek visual language inspired by
 * Beste UI's "pieces" catalog, but strictly re-tokenized to PumpOS's Calm
 * Industrial Precision palette. Every primitive here honors PRODUCT.md:
 *
 *   - Register: product (design SERVES the task; dense, not busy).
 *   - No decorative gradients, glare, 3D tilt, sparkle avatars, or
 *     purple-marketing accents.
 *   - Motion is state-conveying only, ≤200ms, prefers-reduced-motion aware.
 *   - Colors bind to --brand-*, --state-*, --text-*, --bg-*, --border-*.
 *
 * The point of this panel: prove out the aesthetic *before* we run
 * `npx shadcn@latest init` and stand up Tailwind v4. If this feels right in
 * situ, we adopt the stack and start importing Beste pieces under the
 * admission rules documented in PRODUCT.md's anti-references list.
 */

// ---- small local helpers ----

const Section: React.FC<{
  title: string;
  description?: string;
  note?: string;
  children: React.ReactNode;
}> = ({ title, description, note, children }) => (
  <section className="ds-v2-section">
    <header className="ds-v2-section__head">
      <div>
        <div className="ds-v2-section__title">{title}</div>
        {description && <p className="ds-v2-section__desc" style={{ marginTop: 4 }}>{description}</p>}
      </div>
      {note && <div className="ds-v2-section__note">{note}</div>}
    </header>
    <div>{children}</div>
  </section>
);

const ArrowUp = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
    <path d="M4 6.5V1.5M4 1.5L1.5 4M4 1.5L6.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowDown = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
    <path d="M4 1.5V6.5M4 6.5L1.5 4M4 6.5L6.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const InboxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 13V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8m-16 0h5l1 2h4l1-2h5m-16 0v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ---- 1. KPI strip ----

const KpiStrip: React.FC = () => (
  <div className="ds-v2-kpi-strip">
    <div className="ds-v2-kpi">
      <div className="ds-v2-kpi__label">
        <span className="ds-v2-dot ds-v2-dot--brand" />
        Sales today
      </div>
      <div className="ds-v2-kpi__value">{inr(482350)}</div>
      <div className="ds-v2-kpi__foot">
        <span className="ds-v2-delta ds-v2-delta--up">
          <span className="ds-v2-delta__arrow"><ArrowUp /></span> 12.4%
        </span>
        <span>vs yest.</span>
      </div>
    </div>
    <div className="ds-v2-kpi">
      <div className="ds-v2-kpi__label">
        <span className="ds-v2-dot ds-v2-dot--success" />
        Cash in drawer
      </div>
      <div className="ds-v2-kpi__value">{inr(184260)}</div>
      <div className="ds-v2-kpi__foot">
        <span className="ds-v2-delta ds-v2-delta--flat">
          <span className="ds-v2-delta__arrow">–</span> matched
        </span>
      </div>
    </div>
    <div className="ds-v2-kpi">
      <div className="ds-v2-kpi__label">
        <span className="ds-v2-dot ds-v2-dot--warning" />
        Variance
      </div>
      <div className="ds-v2-kpi__value" style={{ color: 'var(--state-warning-fg)' }}>−₹1,240</div>
      <div className="ds-v2-kpi__foot">
        <span>2 tanks over 0.5%</span>
      </div>
    </div>
    <div className="ds-v2-kpi">
      <div className="ds-v2-kpi__label">
        <span className="ds-v2-dot ds-v2-dot--info" />
        Outstanding
      </div>
      <div className="ds-v2-kpi__value">{inr(2148930)}</div>
      <div className="ds-v2-kpi__foot">
        <span className="ds-v2-delta ds-v2-delta--down">
          <span className="ds-v2-delta__arrow"><ArrowDown /></span> 3.1%
        </span>
        <span>7d</span>
      </div>
    </div>
    <div className="ds-v2-kpi">
      <div className="ds-v2-kpi__label">
        <span className="ds-v2-dot ds-v2-dot--neutral" />
        Pending sync
      </div>
      <div className="ds-v2-kpi__value">4</div>
      <div className="ds-v2-kpi__foot">
        <span>retry in 12s</span>
      </div>
    </div>
  </div>
);

// ---- 2. Status vocabulary ----

const StatusVocabulary: React.FC = () => (
  <div className="ds-v2-vstack">
    <div className="ds-v2-hstack">
      <span className="ds-v2-chip ds-v2-chip--success"><span className="ds-v2-dot ds-v2-dot--success" /> Open</span>
      <span className="ds-v2-chip ds-v2-chip--neutral"><span className="ds-v2-dot ds-v2-dot--neutral" /> Closed</span>
      <span className="ds-v2-chip ds-v2-chip--info"><span className="ds-v2-dot ds-v2-dot--info" /> Synced</span>
      <span className="ds-v2-chip ds-v2-chip--warning"><span className="ds-v2-dot ds-v2-dot--warning ds-v2-dot--pulse" /> Pending</span>
      <span className="ds-v2-chip ds-v2-chip--neutral"><span className="ds-v2-dot ds-v2-dot--neutral" /> Offline</span>
      <span className="ds-v2-chip ds-v2-chip--danger"><span className="ds-v2-dot ds-v2-dot--danger" /> Variance</span>
      <span className="ds-v2-chip ds-v2-chip--danger"><span className="ds-v2-dot ds-v2-dot--danger" /> Overdue</span>
      <span className="ds-v2-chip ds-v2-chip--success"><span className="ds-v2-dot ds-v2-dot--success" /> Settled</span>
    </div>
    <div className="ds-v2-hstack">
      <span className="ds-v2-chip ds-v2-chip--outline">Manager</span>
      <span className="ds-v2-chip ds-v2-chip--outline">Accountant</span>
      <span className="ds-v2-chip ds-v2-chip--outline">Staff</span>
      <span className="ds-v2-chip ds-v2-chip--outline"><span className="ds-v2-chip__mono">MS-9</span></span>
      <span className="ds-v2-chip ds-v2-chip--outline"><span className="ds-v2-chip__mono">HSD</span></span>
      <span className="ds-v2-chip ds-v2-chip--outline"><span className="ds-v2-chip__mono">XP-95</span></span>
    </div>
  </div>
);

// ---- 3. Compact list rows ----

type CustomerRow = {
  name: string;
  code: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  balance: number;
  daysDue?: number;
};

const CUSTOMERS: CustomerRow[] = [
  { name: 'Karnataka State RTC', code: 'KSR-041', tone: 'warning', balance: 1_284_320, daysDue: 12 },
  { name: 'Sunrise Logistics Pvt Ltd', code: 'SUN-018', tone: 'danger', balance: 942_600, daysDue: 38 },
  { name: 'Green Fields Farms', code: 'GRF-007', tone: 'success', balance: 12_450 },
  { name: 'Metro Cabs Union', code: 'MCU-102', tone: 'neutral', balance: 0 },
  { name: 'Bright Star Travels', code: 'BST-055', tone: 'warning', balance: 218_500, daysDue: 6 },
];

const CustomerRows: React.FC = () => (
  <ul className="ds-v2-rows">
    {CUSTOMERS.map((c) => (
      <li key={c.code} className="ds-v2-row">
        <span className={`ds-v2-dot ds-v2-dot--${c.tone} ds-v2-row__dot`} />
        <div className="ds-v2-row__body">
          <div className="ds-v2-row__title">{c.name}</div>
          <div className="ds-v2-row__sub">{c.code} · fleet · credit customer</div>
        </div>
        <div className="ds-v2-row__meta">
          <div className="ds-v2-row__value" style={{
            color: c.balance === 0 ? 'var(--text-muted)' : c.tone === 'danger' ? 'var(--state-danger-fg)' : 'var(--text-strong)',
          }}>{inr(c.balance)}</div>
          <div className="ds-v2-row__hint">{c.daysDue ? `${c.daysDue}d overdue` : c.balance === 0 ? 'settled' : 'in credit'}</div>
        </div>
      </li>
    ))}
  </ul>
);

// ---- 4. Compact toolbar (segmented + filter chips + search) ----

const CompactToolbar: React.FC = () => {
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'custom'>('7d');
  const [chips, setChips] = useState<string[]>(['Type: Fuel', 'Payment: Cash']);
  return (
    <div className="ds-v2-toolbar">
      <div className="ds-v2-seg" role="tablist" aria-label="Date range">
        {(['today', '7d', '30d', 'custom'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={range === k}
            className={`ds-v2-seg__opt${range === k ? ' ds-v2-seg__opt--on' : ''}`}
            onClick={() => setRange(k)}
          >
            {k === 'today' ? 'Today' : k === '7d' ? '7 days' : k === '30d' ? '30 days' : 'Custom'}
          </button>
        ))}
      </div>
      <div className="ds-v2-toolbar__divider" />
      <div className="ds-v2-toolbar__group">
        {chips.map((label) => (
          <span key={label} className="ds-v2-fchip">
            {label}
            <button
              type="button"
              className="ds-v2-fchip__close"
              aria-label={`Remove ${label}`}
              onClick={() => setChips((cs) => cs.filter((c) => c !== label))}
            >
              <CloseIcon />
            </button>
          </span>
        ))}
        {chips.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No filters</span>}
      </div>
      <div className="ds-v2-toolbar__search">
        <SearchIcon />
        <input type="search" placeholder="Search customer, invoice, vehicle…" />
      </div>
    </div>
  );
};

// ---- 5. Dense table ----

type Tx = {
  id: string;
  time: string;
  desc: string;
  method: 'Cash' | 'UPI' | 'Card' | 'Credit';
  qty?: number;
  amount: number;
};

const TXS: Tx[] = [
  { id: 'SAL-092141', time: '14:22', desc: 'XP-95 · Nozzle N-3 · 42.180 L',   method: 'UPI',    qty: 42.18, amount: 4820 },
  { id: 'SAL-092142', time: '14:24', desc: 'HSD · Nozzle N-1 · 68.400 L',    method: 'Cash',   qty: 68.40, amount: 6360 },
  { id: 'SAL-092143', time: '14:26', desc: 'Engine Oil 2T · 4 pack',          method: 'Cash',   qty: 4,     amount: 1240 },
  { id: 'SAL-092144', time: '14:31', desc: 'HSD · Nozzle N-2 · 120.000 L',   method: 'Credit', qty: 120,   amount: 11160 },
  { id: 'SAL-092145', time: '14:38', desc: 'MS-9 · Nozzle N-4 · 8.200 L',    method: 'Card',   qty: 8.20,  amount: 940 },
];

const DenseTable: React.FC = () => (
  <table className="ds-v2-table">
    <thead>
      <tr>
        <th style={{ width: 100 }}>ID</th>
        <th style={{ width: 64 }}>Time</th>
        <th>Description</th>
        <th style={{ width: 90 }}>Method</th>
        <th style={{ width: 90, textAlign: 'right' }}>Qty</th>
        <th style={{ width: 110, textAlign: 'right' }}>Amount</th>
      </tr>
    </thead>
    <tbody>
      {TXS.map((t) => {
        const methodTone =
          t.method === 'Cash'   ? 'neutral'
          : t.method === 'UPI'   ? 'info'
          : t.method === 'Card'  ? 'info'
          : /* Credit */           'warning';
        return (
          <tr key={t.id}>
            <td className="ds-v2-table__id">{t.id}</td>
            <td className="ds-v2-table__id">{t.time}</td>
            <td>{t.desc}</td>
            <td>
              <span className={`ds-v2-chip ds-v2-chip--${methodTone}`} style={{ height: 20, fontSize: 10.5 }}>
                {t.method}
              </span>
            </td>
            <td className="ds-v2-table__num">{t.qty !== undefined ? formatQty(t.qty, t.method === 'Cash' && t.qty && Number.isInteger(t.qty) ? 0 : 2) : '—'}</td>
            <td className="ds-v2-table__num">{inr(t.amount)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

// ---- 6. Keyboard shortcut hints ----

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="ds-v2-kbd">{children}</span>
);

const ShortcutRow: React.FC<{ label: string; keys: string[] }> = ({ label, keys }) => (
  <div className="ds-v2-shortcut">
    <span className="ds-v2-shortcut__label">{label}</span>
    <span className="ds-v2-kbd-row">
      {keys.map((k, i) => (
        <React.Fragment key={`${k}-${i}`}>
          {i > 0 && <span className="ds-v2-kbd-plus">+</span>}
          <Kbd>{k}</Kbd>
        </React.Fragment>
      ))}
    </span>
  </div>
);

// ---- 7. Version / snapshot chips ----

const SnapshotChips: React.FC = () => (
  <div className="ds-v2-hstack">
    <span className="ds-v2-version">
      <span className="ds-v2-version__tag">DSSR v1</span>
      <span className="ds-v2-version__meta">generated 09 Jul 14:22</span>
    </span>
    <span className="ds-v2-version">
      <span className="ds-v2-version__tag">SHIFT #4128</span>
      <span className="ds-v2-version__meta">closed 06:04 · 12h 22m</span>
    </span>
    <span className="ds-v2-version">
      <span className="ds-v2-version__tag">RATE 08:00</span>
      <span className="ds-v2-version__meta">HSD ₹92.87 · XP ₹114.20</span>
    </span>
  </div>
);

// ---- 8. Sync pulse + inline empty state ----

const SyncPulse: React.FC = () => (
  <div className="ds-v2-hstack">
    <span className="ds-v2-sync">
      <span className="ds-v2-dot ds-v2-dot--success ds-v2-dot--pulse" />
      <span className="ds-v2-sync__label">Live</span>
      <span className="ds-v2-sync__meta">synced 4s ago</span>
    </span>
    <span className="ds-v2-sync">
      <span className="ds-v2-dot ds-v2-dot--warning ds-v2-dot--pulse" />
      <span className="ds-v2-sync__label">Retrying</span>
      <span className="ds-v2-sync__meta">4 events · next in 12s</span>
    </span>
    <span className="ds-v2-sync">
      <span className="ds-v2-dot ds-v2-dot--neutral" />
      <span className="ds-v2-sync__label">Offline</span>
      <span className="ds-v2-sync__meta">17 events queued</span>
    </span>
  </div>
);

const InlineEmpty: React.FC = () => (
  <div className="ds-v2-empty">
    <span className="ds-v2-empty__icon"><InboxIcon /></span>
    <div className="ds-v2-empty__body">
      <div className="ds-v2-empty__title">No credit sales in this shift yet</div>
      <div className="ds-v2-empty__desc">Fleet customers charged on credit will appear here as their vehicles fuel up. Nothing to reconcile yet.</div>
    </div>
    <button type="button" className="ds-v2-empty__action">Record credit sale</button>
  </div>
);

// ---- root panel ----

export const DesignSystemV2Panel: React.FC = () => (
  <div className="ds-v2">
    <div style={{
      padding: '10px 12px',
      marginBottom: 'var(--space-6)',
      border: '1px solid var(--border-soft)',
      borderRadius: 10,
      background: 'var(--bg-surface-alt)',
      fontSize: 12,
      color: 'var(--text-muted)',
      lineHeight: 1.5,
    }}>
      <strong style={{ color: 'var(--text-strong)' }}>v2 sandbox.</strong> A compact, sleek vocabulary inspired by Beste UI's <em>pieces</em>,
      re-tokenized to the PumpOS palette. The scoped <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>.ds-v2</code> classes are hand-rolled here;
      real primitives land under <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>pump-ds/</code> — see the pump-ds tab.
    </div>

    <Section
      title="KPI strip"
      description="Compact metric row inspired by Beste's dense stat blocks. Single 10px-radius rail, monospace values, tinted delta pill, tone dot in the label. Fits a full dashboard row without hero-sized cards."
      note="Beste refs: badge9 · trend delta"
    >
      <KpiStrip />
    </Section>

    <Section
      title="Status vocabulary"
      description="Canonical operational states as tone-dot chips. First row: run-state (open/closed/synced/pending/offline/variance/overdue/settled). Second row: role and product-code chips as outline variants."
      note="Beste refs: badge1 · automation19"
    >
      <StatusVocabulary />
    </Section>

    <Section
      title="Compact list rows"
      description="Dense list with a leading tone dot, primary + secondary text, and a right-aligned mono value with a hint below. Used for customers, suppliers, shift lists — anything that today ships as a card grid."
      note="Beste refs: legal7 · row patterns"
    >
      <CustomerRows />
    </Section>

    <Section
      title="Compact toolbar"
      description="Segmented range control + removable filter chips + inline search in a single 40px rail. Replaces the multi-row toolbars the app currently ships."
      note="Beste refs: filter-swatch (compact)"
    >
      <CompactToolbar />
    </Section>

    <Section
      title="Dense data table"
      description="Denser row height (32px vs current 44px), 10.5px uppercase headers, mono numeric columns, tone-tinted method chips. Fits ~35% more rows in the same viewport."
      note="Direct pumpos surface: transactions, DSSR line items"
    >
      <DenseTable />
    </Section>

    <Section
      title="Keyboard shortcut hints"
      description="Monospace kbd caps with a 2px bottom border for depth. Used inline in menus, command palette entries, and the empty-state helper strip."
      note="Beste refs: code8"
    >
      <div className="ds-v2-vstack" style={{ gap: 8 }}>
        <ShortcutRow label="Open command palette" keys={['⌘', 'K']} />
        <ShortcutRow label="Close shift" keys={['⌘', 'Shift', 'X']} />
        <ShortcutRow label="Record expense" keys={['E']} />
        <ShortcutRow label="Next tab" keys={['Alt', '→']} />
      </div>
    </Section>

    <Section
      title="Version / snapshot chips"
      description="Immutable-record markers for DSSR, closed shifts, and rate versions. Compact rounded-rectangle with a mono tag on the left and human meta on the right."
      note="Beste refs: automation19"
    >
      <SnapshotChips />
    </Section>

    <Section
      title="Sync pulse"
      description="Ambient sync state as a small pill with a pulsing tone dot. Sits in the AppShell top bar. Reduced-motion users get a static dot."
      note="PumpOS-native · SyncIndicator successor"
    >
      <SyncPulse />
    </Section>

    <Section
      title="Inline empty state"
      description="Compact empty-state strip with a dashed border, small tile icon, headline + explainer, and a low-emphasis action button. Sized for in-page use (drawers, panels), not full-screen."
      note="PumpOS-native · replaces oversized empty cards"
    >
      <InlineEmpty />
    </Section>
  </div>
);
