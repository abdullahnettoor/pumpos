import React, { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageFrame } from './page-frame/index.js';
import { Tabs } from '../pump-ds/tabs/index.js';
import { KpiStrip, KpiTile, SegmentedControl } from '../pump-ds/index.js';
import { DataTable } from './primitives/DataTable.js';
import { useToast } from './primitives/ToastProvider.js';
import { useConfirm } from './primitives/ConfirmDialog.js';
import {
  Field,
  TextInput,
  NumberInput,
  MoneyInput,
  Textarea,
  Select,
  DateField,
} from './primitives/Field.js';
import { Checkbox, Switch } from './primitives/Toggle.js';
import { Combobox } from './primitives/Combobox.js';
import { Tooltip } from './primitives/Tooltip.js';
import { Banner } from './primitives/Banner.js';
import { Drawer } from './Drawer.js';
import { Button, Chip, SkeletonGrid } from '../pump-ds/index.js';
import {
  inr,
  formatMoney,
  formatQty,
  formatSignedMoney,
  signedMoneyParts,
  formatCompactMoney,
  formatQuantity,
} from '../utils/format.js';
import { MONEY_TERMS } from '../utils/moneyTerms.js';
import {
  PumpDsButtonsPanel,
  PumpDsComponentsPanel,
  PumpDsMetricsPanel,
  PumpDsStatusPanel,
} from './DesignSystemPumpDs.js';
import { DataSectionShowcase } from './DesignSystemDataSection.js';
import { TablesShowcase } from './DesignSystemTables.js';
import { PageControlsShowcase } from './DesignSystemPageControls.js';
import { DesignSystemShellProtoPanel } from './DesignSystemShellProto.js';
import { useRunTask } from '../utils/runTask.js';

/**
 * Living design-system reference. Mounted only in local development (see the
 * host apps' `isLocalDev` gate) so the team can eyeball tokens, primitives and
 * proposed patterns before rolling them into product screens. Doubles as the
 * canonical visual spec for future UI work — keep it in sync as primitives land.
 */

// ---- small presentational helpers (local to this reference page) ----

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section style={{ marginBottom: 'var(--space-8)' }}>
    <h2
      style={{
        fontSize: '15px',
        fontWeight: 600,
        color: 'var(--text-strong)',
        marginBottom: 'var(--space-1)',
      }}
    >
      {title}
    </h2>
    {description && (
      <p
        style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-3)',
          maxWidth: 640,
        }}
      >
        {description}
      </p>
    )}
    <div>{children}</div>
  </section>
);

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-soft)',
      borderRadius: 'var(--radius-card)',
      padding: 'var(--space-4)',
      ...style,
    }}
  >
    {children}
  </div>
);

const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
    {children}
  </code>
);

/**
 * A token's resolved value in the current theme, read from the document so the
 * reference never drifts from `index.css` (and shows dark values in dark).
 */
const tokenValue = (token: string): string =>
  typeof document === 'undefined'
    ? ''
    : getComputedStyle(document.documentElement).getPropertyValue(token).trim().toUpperCase();

const ColorSwatch: React.FC<{ name: string; token: string; fg?: string }> = ({
  name,
  token,
  fg,
}) => (
  <div
    style={{
      border: '1px solid var(--border-soft)',
      borderRadius: 'var(--radius-input)',
      overflow: 'hidden',
      backgroundColor: 'var(--bg-surface)',
    }}
  >
    <div
      style={{
        height: 56,
        backgroundColor: `var(${token})`,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '6px 8px',
        color: fg ? `var(${fg})` : 'transparent',
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      {fg ? 'Aa' : ''}
    </div>
    <div style={{ padding: '6px 8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>{name}</div>
      <Mono>{token}</Mono>
      <div style={{ fontSize: '12px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
        {tokenValue(token)}
      </div>
    </div>
  </div>
);

const grid = (min: number): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
  gap: 'var(--space-3)',
});

// ---- token data (values are read live from packages/ui/src/index.css) ----

const NEUTRALS = [
  { name: 'Canvas', token: '--bg-canvas' },
  { name: 'Surface', token: '--bg-surface' },
  { name: 'Surface Alt', token: '--bg-surface-alt' },
  { name: 'Border Soft', token: '--border-soft' },
  { name: 'Border Strong', token: '--border-strong' },
];

/** `fg` is the token of the "Aa" sample drawn on the swatch. */
const TEXT_COLORS = [
  { name: 'Text Strong', token: '--text-strong', fg: '--text-on-neutral' },
  { name: 'Text Default', token: '--text-default', fg: '--bg-surface' },
  { name: 'Text Muted', token: '--text-muted', fg: '--bg-surface' },
  { name: 'Text Faint', token: '--text-faint', fg: '--bg-surface' },
];

const BRAND = [
  { name: 'Petrol Green', token: '--brand-primary', fg: '--text-on-brand' },
  { name: 'Diesel Blue', token: '--brand-secondary', fg: '--text-on-info' },
  { name: 'Signal Amber', token: '--brand-warning', fg: '--text-on-warning' },
  { name: 'Alert Red', token: '--brand-danger', fg: '--text-on-danger' },
];

const STATES: { label: string; bg: string; fg: string }[] = [
  { label: 'Success', bg: '--state-success-bg', fg: '--state-success-fg' },
  { label: 'Warning', bg: '--state-warning-bg', fg: '--state-warning-fg' },
  { label: 'Danger', bg: '--state-danger-bg', fg: '--state-danger-fg' },
  { label: 'Info', bg: '--state-info-bg', fg: '--state-info-fg' },
];

const SPACING = [
  { token: '--space-1', px: 4 },
  { token: '--space-2', px: 8 },
  { token: '--space-3', px: 12 },
  { token: '--space-4', px: 16 },
  { token: '--space-5', px: 20 },
  { token: '--space-6', px: 24 },
  { token: '--space-8', px: 32 },
  { token: '--space-10', px: 40 },
];

const RADII = [
  { token: '--radius-input', px: 8, label: 'Input / Button' },
  { token: '--radius-card', px: 10, label: 'Card' },
  { token: '--radius-drawer', px: 12, label: 'Drawer' },
  { token: '--radius-chip', px: 999, label: 'Chip / Pill' },
];

const TYPE_SCALE = [
  { size: 22, weight: 700, use: 'KPI value' },
  { size: 20, weight: 600, use: 'Page title' },
  { size: 15, weight: 600, use: 'Section title' },
  { size: 14, weight: 400, use: 'Body (base)' },
  { size: 13, weight: 400, use: 'Dense body / inputs' },
  { size: 12, weight: 500, use: 'Secondary, captions, field labels (the minimum)' },
  { size: 10, weight: 600, use: 'Table headers only (uppercase)' },
];

interface DemoRow {
  item: string;
  qty: number;
  amount: number;
}

const DEMO_ROWS: DemoRow[] = [
  { item: 'Petrol', qty: 1240.5, amount: 1240.5 * 106.34 },
  { item: 'Diesel', qty: 970.25, amount: 970.25 * 94.2 },
  { item: 'Engine Oil', qty: 12, amount: 12 * 450 },
  { item: 'Coolant', qty: 8, amount: 8 * 220 },
];

const monoRight: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  display: 'block',
  textAlign: 'right',
};

const DEMO_COLUMNS: ColumnDef<DemoRow, any>[] = [
  { accessorKey: 'item', header: 'Item' },
  {
    accessorKey: 'qty',
    header: 'Qty',
    cell: (c) => <span style={monoRight}>{formatQty(c.getValue() as number)}</span>,
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: (c) => (
      <span style={{ ...monoRight, fontWeight: 600 }}>{inr(c.getValue() as number)}</span>
    ),
  },
];

// ---- tab panels ----

const TokensPanel: React.FC = () => (
  <div>
    <Section
      title="Neutrals & Surfaces"
      description="Backgrounds and borders. The app is light-first: canvas behind, surfaces on top, soft borders for structure, strong borders for inputs."
    >
      <div style={grid(150)}>
        {NEUTRALS.map((c) => (
          <ColorSwatch key={c.token} {...c} />
        ))}
      </div>
    </Section>

    <Section
      title="Text"
      description="Four text weights by emphasis. Prefer Strong for headings, Default for body, Muted for secondary, Faint for hints/placeholders."
    >
      <div style={grid(150)}>
        {TEXT_COLORS.map((c) => (
          <ColorSwatch key={c.token} {...c} />
        ))}
      </div>
    </Section>

    <Section
      title="Brand & Accent"
      description="Petrol Green is the primary action colour. Others carry meaning: Blue = diesel/info, Amber = warning/credit, Red = danger."
    >
      <div style={grid(150)}>
        {BRAND.map((c) => (
          <ColorSwatch key={c.token} {...c} />
        ))}
      </div>
    </Section>

    <Section
      title="State Pairs"
      description="Background + foreground pairs used by badges, banners and inline status. Always use the pair together for adequate contrast."
    >
      <div style={grid(180)}>
        {STATES.map((s) => (
          <div
            key={s.label}
            style={{
              borderRadius: 'var(--radius-input)',
              overflow: 'hidden',
              border: '1px solid var(--border-soft)',
            }}
          >
            <div
              style={{
                backgroundColor: `var(${s.bg})`,
                color: `var(${s.fg})`,
                padding: '10px 12px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {s.label}
            </div>
            <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-surface)' }}>
              <div>
                <Mono>{s.bg}</Mono>{' '}
                <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                  {tokenValue(s.bg)}
                </span>
              </div>
              <div>
                <Mono>{s.fg}</Mono>{' '}
                <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                  {tokenValue(s.fg)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>

    <Section
      title="Typography"
      description="Plus Jakarta Sans for UI, Geist Mono for all numbers/currency/data. Mono keeps figures aligned in tables and KPIs."
    >
      <Card>
        <div
          style={{
            marginBottom: 'var(--space-4)',
            display: 'flex',
            gap: 'var(--space-6)',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '18px',
                color: 'var(--text-strong)',
              }}
            >
              Plus Jakarta Sans
            </div>
            <Mono>--font-sans</Mono>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '18px',
                color: 'var(--text-strong)',
              }}
            >
              Geist Mono 1234567890
            </div>
            <Mono>--font-mono</Mono>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            borderTop: '1px solid var(--border-soft)',
            paddingTop: 'var(--space-3)',
          }}
        >
          {TYPE_SCALE.map((t) => (
            <div
              key={t.size}
              style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}
            >
              <span
                style={{
                  width: 44,
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--text-faint)',
                }}
              >
                {t.size}px
              </span>
              <span
                style={{
                  fontSize: t.size,
                  fontWeight: t.weight,
                  color: 'var(--text-strong)',
                  flex: 1,
                }}
              >
                The quick brown fox
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                {t.use}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </Section>

    <Section
      title="Spacing (4px grid)"
      description="All gaps and padding derive from the 4px scale. Use the tokens rather than hard-coded pixels."
    >
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {SPACING.map((s) => (
            <div
              key={s.token}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
            >
              <span style={{ width: 90, flexShrink: 0 }}>
                <Mono>{s.token}</Mono>
              </span>
              <span
                style={{
                  width: 40,
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--text-faint)',
                }}
              >
                {s.px}px
              </span>
              <div
                style={{
                  height: 12,
                  width: s.px,
                  backgroundColor: 'var(--brand-primary)',
                  borderRadius: 2,
                }}
              />
            </div>
          ))}
        </div>
      </Card>
    </Section>

    <Section title="Radius" description="Corner rounding by surface type.">
      <div style={grid(140)}>
        {RADII.map((r) => (
          <Card key={r.token} style={{ textAlign: 'center' }}>
            <div
              style={{
                height: 48,
                backgroundColor: 'var(--bg-surface-alt)',
                border: '1px solid var(--border-strong)',
                borderRadius: r.px,
                marginBottom: 'var(--space-2)',
              }}
            />
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>
              {r.label}
            </div>
            <Mono>
              {r.token} · {r.px === 999 ? 'full' : `${r.px}px`}
            </Mono>
          </Card>
        ))}
      </div>
    </Section>
  </div>
);

const COMBO_OPTIONS = [
  { value: '', label: 'Walk-in / Not linked' },
  { value: 'c1', label: 'Sri Balaji Transports', sublabel: 'Fleet · ₹12,400 due' },
  { value: 'c2', label: 'Anand Logistics', sublabel: 'Credit · ₹0 due' },
  { value: 'c3', label: 'Kaveri Travels', sublabel: 'Fleet · ₹3,150 due' },
  { value: 'c4', label: 'RTC Depot 4', sublabel: 'Credit · ₹88,000 due' },
  { value: 'c5', label: 'Walk-in — Ramesh', sublabel: 'Regular' },
];

const InputsPanel: React.FC = () => {
  const [customer, setCustomer] = useState('c1');
  const [method, setMethod] = useState('Cash');
  return (
    <div>
      <Section
        title="Form primitives (recommended)"
        description="The canonical building blocks: a Field wrapper (label · required marker · hint / error) plus ref-forwarding TextInput, NumberInput, MoneyInput, Select and Textarea. They drop straight into React Hook Form's register and give every form an identical look, focus ring, invalid state and disabled treatment. Prefer these over inline-styled inputs."
      >
        <Card style={{ maxWidth: 460 }}>
          <Field label="Station name" required hint="Shown on receipts and reports.">
            <TextInput placeholder="e.g. HP Highway Fuels" defaultValue="HP Highway Fuels" />
          </Field>
          <Field label="Opening cash">
            <MoneyInput defaultValue={5000} />
          </Field>
          <Field label="Volume dispensed">
            <NumberInput defaultValue={1240.5} />
          </Field>
          <Field label="Business date">
            <DateField defaultValue="2026-07-01" />
          </Field>
          <Field label="Fuel type">
            <Select>
              <option>Petrol</option>
              <option>Diesel</option>
            </Select>
          </Field>
          <Field label="Amount" required error="Amount is required">
            <MoneyInput invalid placeholder="0.00" />
          </Field>
          <Field label="Notes">
            <Textarea placeholder="Optional remarks…" />
          </Field>
          <Field label="Locked field" hint="Disabled state">
            <TextInput value="Read-only value" disabled readOnly />
          </Field>
        </Card>
      </Section>

      <Section
        title="Usage"
        description="Field owns the label + error/hint; the input owns the control + invalid flag."
      >
        <Card>
          <pre
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-default)',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {`<Field label="Opening cash" required error={errors.openingCash?.message}>
  <MoneyInput {...register('openingCash')} invalid={!!errors.openingCash} />
</Field>`}
          </pre>
        </Card>
      </Section>

      <Section
        title="Searchable select (Combobox)"
        description="For long dynamic lists — customers, products, suppliers — where a native select has no type-ahead. Keyboard: ↑/↓ move, Enter picks, Esc closes. Use a native Select for short fixed lists (payment method, status)."
      >
        <Card style={{ maxWidth: 460 }}>
          <Field
            label="Customer account"
            hint={`Selected: ${COMBO_OPTIONS.find((o) => o.value === customer)?.label ?? '—'}`}
          >
            <Combobox
              options={COMBO_OPTIONS}
              value={customer}
              onChange={setCustomer}
              placeholder="Select customer…"
              searchPlaceholder="Search customers…"
            />
          </Field>
        </Card>
      </Section>

      <Section
        title="Segmented control"
        description="pump-ds SegmentedControl: 2–4 views of the same data, or a short fixed choice in a form (payment method). Filtering rows uses FilterChips; 5+ options use a select. Controlled; wire into RHF with a Controller."
      >
        <Card style={{ maxWidth: 460 }}>
          <Field label={`Payment method — ${method}`}>
            <SegmentedControl
              stretch
              activeStyle="brand"
              options={[
                { value: 'Cash', label: 'Cash' },
                { value: 'Card', label: 'Card' },
                { value: 'UPI', label: 'UPI' },
                { value: 'Credit', label: 'Credit' },
              ]}
              value={method}
              onChange={setMethod}
              aria-label="Payment method"
            />
          </Field>
        </Card>
      </Section>

      <Section
        title="Selection controls"
        description="Checkbox for multi-select / form booleans that submit; Switch for instant on/off settings. Both wrap a native input (brand-tinted / visually-hidden) so they stay keyboard-accessible and RHF-compatible."
      >
        <Card>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              maxWidth: 360,
            }}
          >
            <Checkbox
              defaultChecked
              label="Tax-inclusive pricing"
              description="Fuel is recorded inclusive of GST."
            />
            <Checkbox label="Send daily DSR email" />
            <Checkbox disabled label="Locked option (disabled)" />
            <div
              style={{
                borderTop: '1px solid var(--border-soft)',
                paddingTop: 'var(--space-3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <Switch
                defaultChecked
                label="Station open"
                description="Toggle accepts shifts today."
              />
              <Switch label="Maintenance mode" />
              <Switch disabled label="Disabled switch" />
            </div>
          </div>
        </Card>
      </Section>

      <Section
        title="Sizes"
        description="Two input heights. .input (36px) for forms/drawers, .input-compact (28px) for filter bars and toolbars."
      >
        <Card>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              maxWidth: 320,
            }}
          >
            <div>
              <Mono>.input</Mono>
              <input className="input" defaultValue="36px · forms" />
            </div>
            <div>
              <Mono>.input .input-compact</Mono>
              <input className="input input-compact" defaultValue="28px · toolbars" />
            </div>
          </div>
        </Card>
      </Section>
    </div>
  );
};

const ComponentsPanel: React.FC = () => {
  const [tab, setTab] = useState('general');
  const [plainTab, setPlainTab] = useState('summary');
  return (
    <div>
      <Section
        title="Status badges"
        description="Compact status pills (pump-ds Chip). Pick the tone that matches meaning."
      >
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Chip tone="success" size="sm">
              Open
            </Chip>
            <Chip tone="warning" size="sm">
              Pending
            </Chip>
            <Chip tone="danger" size="sm">
              Variance
            </Chip>
            <Chip tone="info" size="sm">
              Credit
            </Chip>
            <Chip tone="neutral" size="sm">
              Closed
            </Chip>
          </div>
        </Card>
      </Section>

      <Section
        title="KPI strip"
        description="Metric tiles in a gap-as-divider strip. Plain mono values; a tile is coloured only through alert, for a problem. See Page controls for period chips and layouts."
      >
        <KpiStrip columns="auto">
          <KpiTile label="Total sales" value={inr(482350.5)} />
          <KpiTile label="Cash variance" alert="danger" value={inr(-320)} hint="Short by ₹320" />
          <KpiTile label="Credit given" value={inr(15400)} />
          <KpiTile label="Volume sold" value={formatQty(3210.75)} hint="Petrol + Diesel" />
        </KpiStrip>
      </Section>

      <Section
        title="Tabs"
        description="pump-ds Tabs: page-level tab bars. Icon + label on every tab or none (a mixed bar logs a dev warning). Icons come only from the concept map (a tab names its concept; there is no free icon prop), 14px muted, brand on the active tab. A number badge is a count pill; text is a status chip in the tab tone. ←/→, Home and End move between tabs. Segmented switches inside a section use SegmentedControl instead."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Tabs
            aria-label="Design system demo tabs"
            activeId={tab}
            onChange={setTab}
            tabs={[
              { id: 'general', label: 'General', concept: 'general' },
              { id: 'branding', label: 'Branding', concept: 'branding' },
              { id: 'tanks', label: 'Tanks', concept: 'tanks', badge: 4 },
              { id: 'rules', label: 'Rules', concept: 'rules' },
              {
                id: 'report-templates',
                label: 'Report templates',
                concept: 'report-templates',
              },
              { id: 'locked', label: 'Locked', concept: 'activity', disabled: true },
            ]}
          />
          <Tabs
            aria-label="Design system demo tabs without icons"
            activeId={plainTab}
            onChange={setPlainTab}
            tabs={[
              { id: 'summary', label: 'Summary' },
              { id: 'shifts', label: 'Shifts', badge: 'open' },
              { id: 'audit', label: 'Audit log', badge: 2, tone: 'warning' },
            ]}
          />
        </div>
      </Section>

      <Section
        title="Data table"
        description="Dense sortable table (TanStack Table) with built-in loading / empty / error / refusal states (see Data states). Click a header to sort. Use for all operational lists instead of hand-rolled tables."
      >
        <DataTable
          columns={DEMO_COLUMNS}
          data={DEMO_ROWS}
          initialSorting={[{ id: 'amount', desc: true }]}
        />
      </Section>

      <Section
        title="Skeletons"
        description="Pulsing placeholders (pump-ds Skeleton and SkeletonGrid) for lazy / partial loading — render the page shell immediately and swap these in for cards or rows while their data loads, instead of blocking the whole screen."
      >
        <SkeletonGrid count={3} />
      </Section>
    </div>
  );
};

const OverlaysPanel: React.FC = () => {
  const [open, setOpen] = useState<false | 'default' | 'wide'>(false);
  return (
    <div>
      <Section
        title="Drawer"
        description="Right-side panel for create / edit flows — the preferred alternative to modals (List → Drawer → Edit). Default and wide widths, an optional pinned footer, closes on Esc or backdrop click."
      >
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => setOpen('default')}>
              Open drawer
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOpen('wide')}>
              Open wide drawer
            </Button>
          </div>
        </Card>
      </Section>
      <Drawer
        isOpen={open !== false}
        onClose={() => setOpen(false)}
        title={open === 'wide' ? 'Wide drawer example' : 'Drawer example'}
        widthVariant={open === 'wide' ? 'wide' : 'default'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Save</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label className="field-label">Name</label>
            <input className="input" defaultValue="Sample field" />
          </div>
          <div>
            <label className="field-label">Amount</label>
            <input
              className="input"
              type="number"
              min="0"
              defaultValue={1200}
              style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}
            />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            The body scrolls, the header carries a close button, and the footer stays pinned. Press
            Esc or click the backdrop to dismiss.
          </p>
        </div>
      </Drawer>

      <Section
        title="Tooltip"
        description="Hover / focus bubble for hints and truncated values. Wire meaningful hints through this instead of bare title attributes."
      >
        <Card>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-4)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Tooltip content="Reconciles at shift close">
              <Button variant="secondary" size="sm">
                Hover me
              </Button>
            </Tooltip>
            <Tooltip content="Expected − Actual drawer cash" placement="bottom">
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--brand-secondary)',
                  textDecoration: 'underline dotted',
                  cursor: 'help',
                }}
              >
                What is variance?
              </span>
            </Tooltip>
          </div>
        </Card>
      </Section>
    </div>
  );
};

const FeedbackPanel: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const runTask = useRunTask();
  const [lastResult, setLastResult] = useState('\u2014');
  return (
    <div>
      <Section
        title="Toasts"
        description="One stack, bottom centre above the status bar, at most three. Secondary to the row a save updates. Successes leave after 4 seconds and may carry an action; errors stay until dismissed and say what to do next."
      >
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => toast.success('Shift closed successfully')}>
              Success
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                toast.error('Account is closed. Choose another account and save again.', {
                  title: 'Expense not saved',
                })
              }
            >
              Error
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast.info('Sync in progress\u2026')}
            >
              Info
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.success('DSR compiled for 01 Jul', { title: 'Report ready' })}
            >
              With title
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                toast.success('Expense recorded.', {
                  action: { label: 'View record', onClick: () => undefined },
                })
              }
            >
              With action
            </Button>
          </div>
        </Card>
      </Section>

      <Section
        title="Confirm dialog"
        description="Promise-based confirmation (replaces window.confirm). Esc cancels, Enter confirms. Use the danger variant for destructive actions."
      >
        <Card>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                runTask(
                  confirm({
                    title: 'Discard changes?',
                    message: 'Your unsaved edits will be lost.',
                  }).then((ok) => setLastResult(ok ? 'confirmed' : 'cancelled')),
                  'Could not open the confirmation.',
                )
              }
            >
              Standard confirm
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                runTask(
                  confirm({
                    title: 'Delete vehicle?',
                    message: 'This cannot be undone.',
                    confirmLabel: 'Delete',
                    danger: true,
                  }).then((ok) => setLastResult(ok ? 'confirmed (danger)' : 'cancelled')),
                  'Could not open the confirmation.',
                )
              }
            >
              Danger confirm
            </Button>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Last result:{' '}
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                {lastResult}
              </strong>
            </span>
          </div>
        </Card>
      </Section>

      <Section
        title="Banners"
        description="Inline, section-level status messages — the persistent counterpart to a toast. Persistent banners stay until their condition clears (low stock, offline); dismissible banners show a × and hide on click. Severity maps to state colours; supports an optional inline action."
      >
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Banner severity="danger" actionLabel="View Stock" onAction={() => {}}>
              Tank 1 (Petrol) critically low — 4% · 480 L
            </Banner>
            <Banner severity="warning">Tank 2 (Diesel) running low — 12% · 1,440 L</Banner>
            <Banner severity="info" title="Offline">
              Working from local cache — changes will sync when you reconnect.
            </Banner>
            <Banner severity="success" dismissible>
              DSR compiled for 01 Jul. This banner is dismissible.
            </Banner>
          </div>
        </Card>
      </Section>
    </div>
  );
};

const DataMoneyPanel: React.FC = () => {
  const rows = [
    { item: 'Petrol', qty: 1240.5, rate: 106.34, amount: 1240.5 * 106.34 },
    { item: 'Diesel', qty: 970.25, rate: 94.2, amount: 970.25 * 94.2 },
    { item: 'Engine Oil', qty: 12, rate: 450, amount: 12 * 450 },
  ];
  return (
    <div>
      <Section
        title="Money formatter"
        description="Always render currency via inr() — 2-decimal, grouped, ₹ prefix; a signed figure via formatSignedMoney (true minus, no negative zero); a quantity via formatQuantity; tiles via formatCompactMoney. Never hand-roll toLocaleString for money."
      >
        <Card>
          <table
            style={{ width: '100%', maxWidth: 520, borderCollapse: 'collapse', fontSize: '13px' }}
          >
            <tbody>
              {[
                { call: 'inr(5000)', out: inr(5000) },
                { call: 'inr(5000.5)', out: inr(5000.5) },
                { call: 'inr(-320.4)', out: inr(-320.4) },
                {
                  call: 'formatMoney(1234.5, { symbol: false })',
                  out: formatMoney(1234.5, { symbol: false }),
                },
                {
                  call: 'formatSignedMoney(-1200.5, { plus: true })',
                  out: formatSignedMoney(-1200.5, { plus: true }),
                },
                {
                  call: 'formatSignedMoney(85, { plus: true, symbol: false })',
                  out: formatSignedMoney(85, { plus: true, symbol: false }),
                },
                {
                  call: 'signedMoneyParts(-340, { decimals: 0 }).sign',
                  out: signedMoneyParts(-340, { decimals: 0 }).sign,
                },
                { call: 'formatCompactMoney(287000)', out: formatCompactMoney(287000) },
                { call: "formatQuantity(1240.5, 'L')", out: formatQuantity(1240.5, 'L') },
                { call: "formatQuantity(18.46, 'KL')", out: formatQuantity(18.46, 'KL') },
                {
                  call: "formatQuantity(12345.678, 'L', { decimals: 3 })",
                  out: formatQuantity(12345.678, 'L', { decimals: 3 }),
                },
                { call: 'MONEY_TERMS.receivable', out: MONEY_TERMS.receivable },
                { call: 'MONEY_TERMS.owesYou', out: MONEY_TERMS.owesYou },
              ].map((r) => (
                <tr key={r.call} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <Mono>{r.call}</Mono>
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                    }}
                  >
                    {r.out}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section
        title="Table pattern"
        description="Amounts/quantities right-align with the mono font; labels left-align with the sans font. This keeps figures scannable."
      >
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left' }}>
                <th
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Item
                </th>
                <th
                  style={{
                    padding: '8px 12px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Qty
                </th>
                <th
                  style={{
                    padding: '8px 12px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Rate
                </th>
                <th
                  style={{
                    padding: '8px 12px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-strong)' }}>{r.item}</td>
                  <td
                    style={{
                      padding: '8px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {formatQty(r.qty)}
                  </td>
                  <td
                    style={{
                      padding: '8px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(r.rate)}
                  </td>
                  <td
                    style={{
                      padding: '8px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                    }}
                  >
                    {inr(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>
    </div>
  );
};

// ---- root ----

const TABS = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'inputs', label: 'Inputs & Forms' },
  { id: 'components', label: 'Components' },
  { id: 'status', label: 'Status vocabulary' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'data', label: 'Data & Money' },
  { id: 'data-states', label: 'Data states' },
  { id: 'tables', label: 'Tables' },
  { id: 'page-controls', label: 'Page controls' },
  { id: 'shell-proto', label: 'Shell · proto' },
];

export const DesignSystem: React.FC = () => {
  const [active, setActive] = useState('tokens');
  return (
    <PageFrame
      title="Design System"
      subtitle="Local-only reference for tokens, primitives and patterns. Verify design choices here before applying them to product screens."
      tabs={
        <Tabs
          tabs={TABS}
          activeId={active}
          onChange={setActive}
          aria-label="Design system sections"
        />
      }
    >
      {active === 'tokens' && <TokensPanel />}
      {active === 'buttons' && <PumpDsButtonsPanel />}
      {active === 'inputs' && <InputsPanel />}
      {active === 'components' && (
        <>
          <ComponentsPanel />
          <PumpDsComponentsPanel />
        </>
      )}
      {active === 'status' && <PumpDsStatusPanel />}
      {active === 'overlays' && <OverlaysPanel />}
      {active === 'feedback' && <FeedbackPanel />}
      {active === 'data' && (
        <>
          <DataMoneyPanel />
          <PumpDsMetricsPanel />
        </>
      )}
      {active === 'data-states' && (
        <Section
          title="DataSection · states"
          description="A region that loads its own data shows exactly one of these. Loading while a request is fetching or paused offline (a disabled query shows nothing); “Couldn't load … · Retry” for network/server faults; the server's message and no Retry for an access refusal (403 / access policy); the empty state only after success; otherwise the content. Fake queries — no network."
        >
          <DataSectionShowcase />
        </Section>
      )}
      {active === 'tables' && (
        <Section
          title="Table module"
          description="One set of typed columns (money, qty, date, text, status), two adapters. Money and qty read right-aligned in mono, header and total included, through the shared formats; status reads the status vocabulary; money and qty add up in the total row. The interactive table sorts and opens a row; the statement is read-only, compact and prints in light ink."
        >
          <TablesShowcase />
        </Section>
      )}
      {active === 'page-controls' && <PageControlsShowcase />}
      {active === 'shell-proto' && <DesignSystemShellProtoPanel />}
    </PageFrame>
  );
};
