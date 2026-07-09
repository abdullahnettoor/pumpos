import React, { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageLayout } from './primitives/PageLayout.js';
import { Tabs } from './primitives/Tabs.js';
import { KpiCard } from './primitives/KpiCard.js';
import { DataTable } from './primitives/DataTable.js';
import { SkeletonGrid } from './primitives/Skeleton.js';
import { useToast } from './primitives/ToastProvider.js';
import { useConfirm } from './primitives/ConfirmDialog.js';
import { Field, TextInput, NumberInput, MoneyInput, Textarea, Select, DateField } from './primitives/Field.js';
import { Checkbox, Switch } from './primitives/Toggle.js';
import { Segmented } from './primitives/Segmented.js';
import { Combobox } from './primitives/Combobox.js';
import { Tooltip } from './primitives/Tooltip.js';
import { Menu, Popover } from './primitives/Menu.js';
import { Banner } from './primitives/Banner.js';
import { Drawer } from './Drawer.js';
import { StatusBadge } from './StatusBadge.js';
import { inr, formatMoney, formatQty } from '../utils/format.js';

/**
 * Living design-system reference. Mounted only in local development (see the
 * host apps' `isLocalDev` gate) so the team can eyeball tokens, primitives and
 * proposed patterns before rolling them into product screens. Doubles as the
 * canonical visual spec for future UI work — keep it in sync as primitives land.
 */

// ---- small presentational helpers (local to this reference page) ----

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section style={{ marginBottom: 'var(--space-8)' }}>
    <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: 'var(--space-1)' }}>{title}</h2>
    {description && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', maxWidth: 640 }}>{description}</p>}
    <div>{children}</div>
  </section>
);

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', padding: 'var(--space-4)', ...style }}>
    {children}
  </div>
);

const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>{children}</code>
);

const ColorSwatch: React.FC<{ name: string; token: string; value: string; fg?: string }> = ({ name, token, value, fg }) => (
  <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
    <div style={{ height: 56, backgroundColor: `var(${token})`, display: 'flex', alignItems: 'flex-end', padding: '6px 8px', color: fg ?? 'transparent', fontSize: '11px', fontWeight: 600 }}>
      {fg ? 'Aa' : ''}
    </div>
    <div style={{ padding: '6px 8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>{name}</div>
      <Mono>{token}</Mono>
      <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  </div>
);

const grid = (min: number): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
  gap: 'var(--space-3)',
});

// ---- token data (mirrors packages/ui/src/index.css :root) ----

const NEUTRALS = [
  { name: 'Canvas', token: '--bg-canvas', value: '#F6F7F4' },
  { name: 'Surface', token: '--bg-surface', value: '#FFFFFF' },
  { name: 'Surface Alt', token: '--bg-surface-alt', value: '#F1F3EF' },
  { name: 'Border Soft', token: '--border-soft', value: '#D9DED6' },
  { name: 'Border Strong', token: '--border-strong', value: '#B9C1B7' },
];

const TEXT_COLORS = [
  { name: 'Text Strong', token: '--text-strong', value: '#18201A', fg: '#FFFFFF' },
  { name: 'Text Default', token: '--text-default', value: '#2B342D', fg: '#FFFFFF' },
  { name: 'Text Muted', token: '--text-muted', value: '#5E6A61', fg: '#FFFFFF' },
  { name: 'Text Faint', token: '--text-faint', value: '#7A857C', fg: '#FFFFFF' },
];

const BRAND = [
  { name: 'Petrol Green', token: '--brand-primary', value: '#1F6A53', fg: '#FFFFFF' },
  { name: 'Diesel Blue', token: '--brand-secondary', value: '#2E5E88', fg: '#FFFFFF' },
  { name: 'Signal Amber', token: '--brand-warning', value: '#B7811E', fg: '#FFFFFF' },
  { name: 'Alert Red', token: '--brand-danger', value: '#B44A3F', fg: '#FFFFFF' },
];

const STATES: { label: string; bg: string; fg: string; bgVal: string; fgVal: string }[] = [
  { label: 'Success', bg: '--state-success-bg', fg: '--state-success-fg', bgVal: '#E8F4EE', fgVal: '#1E6A4E' },
  { label: 'Warning', bg: '--state-warning-bg', fg: '--state-warning-fg', bgVal: '#F9F0DA', fgVal: '#8A6116' },
  { label: 'Danger', bg: '--state-danger-bg', fg: '--state-danger-fg', bgVal: '#F8E3E0', fgVal: '#9F3F36' },
  { label: 'Info', bg: '--state-info-bg', fg: '--state-info-fg', bgVal: '#E8F0F7', fgVal: '#2E5E88' },
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
  { size: 12, weight: 500, use: 'Secondary / captions' },
  { size: 11, weight: 600, use: 'Labels (uppercase)' },
];

interface DemoRow { item: string; qty: number; amount: number; }

const DEMO_ROWS: DemoRow[] = [
  { item: 'Petrol', qty: 1240.5, amount: 1240.5 * 106.34 },
  { item: 'Diesel', qty: 970.25, amount: 970.25 * 94.2 },
  { item: 'Engine Oil', qty: 12, amount: 12 * 450 },
  { item: 'Coolant', qty: 8, amount: 8 * 220 },
];

const monoRight: React.CSSProperties = { fontFamily: 'var(--font-mono)', display: 'block', textAlign: 'right' };

const DEMO_COLUMNS: ColumnDef<DemoRow, any>[] = [
  { accessorKey: 'item', header: 'Item' },
  { accessorKey: 'qty', header: 'Qty', cell: (c) => <span style={monoRight}>{formatQty(c.getValue() as number)}</span> },
  { accessorKey: 'amount', header: 'Amount', cell: (c) => <span style={{ ...monoRight, fontWeight: 600 }}>{inr(c.getValue() as number)}</span> },
];

// ---- tab panels ----

const TokensPanel: React.FC = () => (
  <div>
    <Section title="Neutrals & Surfaces" description="Backgrounds and borders. The app is light-first: canvas behind, surfaces on top, soft borders for structure, strong borders for inputs.">
      <div style={grid(150)}>
        {NEUTRALS.map((c) => <ColorSwatch key={c.token} {...c} />)}
      </div>
    </Section>

    <Section title="Text" description="Four text weights by emphasis. Prefer Strong for headings, Default for body, Muted for secondary, Faint for hints/placeholders.">
      <div style={grid(150)}>
        {TEXT_COLORS.map((c) => <ColorSwatch key={c.token} {...c} />)}
      </div>
    </Section>

    <Section title="Brand & Accent" description="Petrol Green is the primary action colour. Others carry meaning: Blue = diesel/info, Amber = warning/credit, Red = danger.">
      <div style={grid(150)}>
        {BRAND.map((c) => <ColorSwatch key={c.token} {...c} />)}
      </div>
    </Section>

    <Section title="State Pairs" description="Background + foreground pairs used by badges, banners and inline status. Always use the pair together for adequate contrast.">
      <div style={grid(180)}>
        {STATES.map((s) => (
          <div key={s.label} style={{ borderRadius: 'var(--radius-input)', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
            <div style={{ backgroundColor: `var(${s.bg})`, color: `var(${s.fg})`, padding: '10px 12px', fontSize: '12px', fontWeight: 600 }}>
              {s.label}
            </div>
            <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-surface)' }}>
              <div><Mono>{s.bg}</Mono> <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{s.bgVal}</span></div>
              <div><Mono>{s.fg}</Mono> <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{s.fgVal}</span></div>
            </div>
          </div>
        ))}
      </div>
    </Section>

    <Section title="Typography" description="IBM Plex Sans for UI, IBM Plex Mono for all numbers/currency/data. Mono keeps figures aligned in tables and KPIs.">
      <Card>
        <div style={{ marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '18px', color: 'var(--text-strong)' }}>IBM Plex Sans</div>
            <Mono>--font-sans</Mono>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', color: 'var(--text-strong)' }}>IBM Plex Mono 1234567890</div>
            <Mono>--font-mono</Mono>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderTop: '1px solid var(--border-soft)', paddingTop: 'var(--space-3)' }}>
          {TYPE_SCALE.map((t) => (
            <div key={t.size} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
              <span style={{ width: 44, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)' }}>{t.size}px</span>
              <span style={{ fontSize: t.size, fontWeight: t.weight, color: 'var(--text-strong)', flex: 1 }}>The quick brown fox</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{t.use}</span>
            </div>
          ))}
        </div>
      </Card>
    </Section>

    <Section title="Spacing (4px grid)" description="All gaps and padding derive from the 4px scale. Use the tokens rather than hard-coded pixels.">
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {SPACING.map((s) => (
            <div key={s.token} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ width: 90, flexShrink: 0 }}><Mono>{s.token}</Mono></span>
              <span style={{ width: 40, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)' }}>{s.px}px</span>
              <div style={{ height: 12, width: s.px, backgroundColor: 'var(--brand-primary)', borderRadius: 2 }} />
            </div>
          ))}
        </div>
      </Card>
    </Section>

    <Section title="Radius" description="Corner rounding by surface type.">
      <div style={grid(140)}>
        {RADII.map((r) => (
          <Card key={r.token} style={{ textAlign: 'center' }}>
            <div style={{ height: 48, backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-strong)', borderRadius: r.px, marginBottom: 'var(--space-2)' }} />
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>{r.label}</div>
            <Mono>{r.token} · {r.px === 999 ? 'full' : `${r.px}px`}</Mono>
          </Card>
        ))}
      </div>
    </Section>
  </div>
);

const ButtonsPanel: React.FC = () => {
  const variants: { cls: string; label: string }[] = [
    { cls: 'btn-primary', label: 'Primary' },
    { cls: 'btn-secondary', label: 'Secondary' },
    { cls: 'btn-danger', label: 'Danger' },
    { cls: 'btn-ghost', label: 'Ghost' },
  ];
  const sizes: { cls: string; label: string }[] = [
    { cls: 'btn-sm', label: 'sm · 32px' },
    { cls: 'btn-md', label: 'md · 36px' },
    { cls: 'btn-lg', label: 'lg · 40px' },
  ];
  return (
    <div>
      <Section title="Variants × Sizes" description="Canonical button system: `btn` base + one variant + one size. Use these classes everywhere instead of inline-styled buttons.">
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {variants.map((v) => (
              <div key={v.cls} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <span style={{ width: 90, flexShrink: 0, fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{v.label}</span>
                {sizes.map((s) => (
                  <button key={s.cls} className={`btn ${v.cls} ${s.cls}`}>{v.label}</button>
                ))}
                <button className={`btn ${v.cls} btn-md`} disabled>Disabled</button>
              </div>
            ))}
          </div>
        </Card>
      </Section>
      <Section title="Usage" description="Reach for Primary for the single main action per view. Secondary for cancel/close. Danger only for destructive confirmations. Ghost for toolbar / low-emphasis actions.">
        <Card>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-default)', whiteSpace: 'pre-wrap', margin: 0 }}>
{`<button className="btn btn-primary btn-md">Save</button>
<button className="btn btn-secondary btn-md">Cancel</button>
<button className="btn btn-danger btn-sm">Delete</button>`}
          </pre>
        </Card>
      </Section>
    </div>
  );
};

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
    <Section title="Form primitives (recommended)" description="The canonical building blocks: a Field wrapper (label · required marker · hint / error) plus ref-forwarding TextInput, NumberInput, MoneyInput, Select and Textarea. They drop straight into React Hook Form's register and give every form an identical look, focus ring, invalid state and disabled treatment. Prefer these over inline-styled inputs.">
      <Card style={{ maxWidth: 460 }}>
        <Field label="Station name" required hint="Shown on receipts and reports.">
          <TextInput placeholder="e.g. HP Highway Fuels" defaultValue="HP Highway Fuels" />
        </Field>
        <Field label="Opening cash">
          <MoneyInput defaultValue={5000} />
        </Field>
        <Field label="Litres dispensed">
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

    <Section title="Usage" description="Field owns the label + error/hint; the input owns the control + invalid flag.">
      <Card>
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-default)', whiteSpace: 'pre-wrap', margin: 0 }}>
{`<Field label="Opening cash" required error={errors.openingCash?.message}>
  <MoneyInput {...register('openingCash')} invalid={!!errors.openingCash} />
</Field>`}
        </pre>
      </Card>
    </Section>

    <Section title="Searchable select (Combobox)" description="For long dynamic lists — customers, products, suppliers — where a native select has no type-ahead. Keyboard: ↑/↓ move, Enter picks, Esc closes. Use a native Select for short fixed lists (payment method, status).">
      <Card style={{ maxWidth: 460 }}>
        <Field label="Customer account" hint={`Selected: ${COMBO_OPTIONS.find((o) => o.value === customer)?.label ?? '—'}`}>
          <Combobox options={COMBO_OPTIONS} value={customer} onChange={setCustomer} placeholder="Select customer…" searchPlaceholder="Search customers…" />
        </Field>
      </Card>
    </Section>

    <Section title="Segmented control" description="A compact button group for a small fixed set of options (payment method, filters, view toggles). Replaces the hand-rolled inline button grids. Controlled; wire into RHF with a Controller.">
      <Card style={{ maxWidth: 460 }}>
        <Field label={`Payment method — ${method}`}>
          <Segmented
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

    <Section title="Selection controls" description="Checkbox for multi-select / form booleans that submit; Switch for instant on/off settings. Both wrap a native input (brand-tinted / visually-hidden) so they stay keyboard-accessible and RHF-compatible.">
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 360 }}>
          <Checkbox defaultChecked label="Tax-inclusive pricing" description="Fuel is recorded inclusive of GST." />
          <Checkbox label="Send daily DSSR email" />
          <Checkbox disabled label="Locked option (disabled)" />
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Switch defaultChecked label="Station open" description="Toggle accepts shifts today." />
            <Switch label="Maintenance mode" />
            <Switch disabled label="Disabled switch" />
          </div>
        </div>
      </Card>
    </Section>

    <Section title="Sizes" description="Two input heights. .input (36px) for forms/drawers, .input-compact (28px) for filter bars and toolbars.">
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 320 }}>
          <div><Mono>.input</Mono><input className="input" defaultValue="36px · forms" /></div>
          <div><Mono>.input .input-compact</Mono><input className="input input-compact" defaultValue="28px · toolbars" /></div>
        </div>
      </Card>
    </Section>

    <Section title="Legacy .form-input — now unified" description="The old .form-input class and bare <select> elements are now aliased to the canonical .input look (36px · 13px · strong border), so existing setup screens match the primitives without a per-input rewrite. New forms should still use the Field + primitives above; .input-compact (28px) remains for filter bars.">
      <Card>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div><Mono>.form-input (aliased)</Mono><input className="form-input" defaultValue="matches" style={{ maxWidth: 160 }} /></div>
          <div><Mono>&lt;TextInput /&gt;</Mono><TextInput defaultValue="matches" style={{ maxWidth: 160 }} /></div>
        </div>
      </Card>
    </Section>
  </div>
  );
};

const ComponentsPanel: React.FC = () => {
  const [tab, setTab] = useState('overview');
  return (
    <div>
      <Section title="Status badges" description="Compact status pills. Pick the type that matches meaning.">
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <StatusBadge status="Open" type="success" />
            <StatusBadge status="Pending" type="warning" />
            <StatusBadge status="Variance" type="danger" />
            <StatusBadge status="Credit" type="info" />
            <StatusBadge status="Closed" type="default" />
          </div>
        </Card>
      </Section>

      <Section title="KPI cards" description="Metric tiles for dashboards and summary strips. Values use the mono font.">
        <div style={grid(180)}>
          <KpiCard label="Total Sales" value={inr(482350.5)} tone="success" />
          <KpiCard label="Cash Variance" value={inr(-320)} tone="danger" sub="Short by ₹320" />
          <KpiCard label="Credit Given" value={inr(15400)} tone="warning" />
          <KpiCard label="Litres Sold" value={formatQty(3210.75)} tone="info" sub="Petrol + Diesel" />
        </div>
      </Section>

      <Section title="Tabs" description="The shared Tabs primitive — keyboard accessible, roving focus. Use for all in-page tab strips.">
        <Card>
          <Tabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'details', label: 'Details', badge: 3 },
              { id: 'history', label: 'History' },
              { id: 'locked', label: 'Locked', disabled: true },
            ]}
            activeId={tab}
            onChange={setTab}
            aria-label="Design system demo tabs"
          />
          <div style={{ padding: 'var(--space-3)', fontSize: '13px', color: 'var(--text-muted)' }}>Active panel: <strong>{tab}</strong></div>
        </Card>
      </Section>

      <Section title="Data table" description="Dense sortable table (TanStack Table) with built-in loading / empty / error states. Click a header to sort. Use for all operational lists instead of hand-rolled tables.">
        <DataTable columns={DEMO_COLUMNS} data={DEMO_ROWS} initialSorting={[{ id: 'amount', desc: true }]} />
      </Section>

      <Section title="Skeletons" description="Shimmer placeholders for lazy / partial loading — render the page shell immediately and swap these in for cards or rows while their data loads, instead of blocking the whole screen.">
        <SkeletonGrid count={3} />
      </Section>
    </div>
  );
};

const OverlaysPanel: React.FC = () => {
  const [open, setOpen] = useState<false | 'default' | 'wide'>(false);
  return (
    <div>
      <Section title="Drawer" description="Right-side panel for create / edit flows — the preferred alternative to modals (List → Drawer → Edit). Default and wide widths, an optional pinned footer, closes on Esc or backdrop click.">
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setOpen('default')}>Open drawer</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen('wide')}>Open wide drawer</button>
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
            <button className="btn btn-secondary btn-md" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-md" onClick={() => setOpen(false)}>Save</button>
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
            <input className="input" type="number" min="0" defaultValue={1200} style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }} />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            The body scrolls, the header carries a close button, and the footer stays pinned. Press Esc or click the backdrop to dismiss.
          </p>
        </div>
      </Drawer>

      <Section title="Dropdown menu" description="A trigger button plus a list of actions. Closes on select, outside click or Esc. Use for row / entity actions instead of crowding a row with buttons.">
        <Card>
          <Menu
            trigger={<>Actions ▾</>}
            items={[
              { label: 'View details', onSelect: () => {} },
              { label: 'Edit', onSelect: () => {} },
              { label: 'Archive', onSelect: () => {} },
              { label: 'Delete', danger: true, onSelect: () => {} },
            ]}
          />
        </Card>
      </Section>

      <Section title="Popover" description="A floating panel anchored to a trigger for richer content — filter forms, column pickers, quick summaries. Closes on outside click or Esc.">
        <Card>
          <Popover trigger={<>Filters</>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 200, padding: 'var(--space-2)' }}>
              <Field label="From" style={{ marginBottom: 0 }}><DateField defaultValue="2026-06-01" /></Field>
              <Field label="To" style={{ marginBottom: 0 }}><DateField defaultValue="2026-06-30" /></Field>
              <Checkbox label="Only with variance" />
            </div>
          </Popover>
        </Card>
      </Section>

      <Section title="Tooltip" description="Hover / focus bubble for hints and truncated values. Wire meaningful hints through this instead of bare title attributes.">
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip content="Reconciles at shift close">
              <button className="btn btn-secondary btn-sm">Hover me</button>
            </Tooltip>
            <Tooltip content="Expected − Actual drawer cash" placement="bottom">
              <span style={{ fontSize: '13px', color: 'var(--brand-secondary)', textDecoration: 'underline dotted', cursor: 'help' }}>What is variance?</span>
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
  const [lastResult, setLastResult] = useState('\u2014');
  return (
    <div>
      <Section title="Toasts" description="Non-blocking notifications (replaces alert). Auto-dismiss after a few seconds; errors linger longer. Success after a save, error on failure, info for neutral notices.">
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => toast.success('Shift closed successfully')}>Success</button>
            <button className="btn btn-danger btn-sm" onClick={() => toast.error('Failed to save expense')}>Error</button>
            <button className="btn btn-secondary btn-sm" onClick={() => toast.info('Sync in progress\u2026')}>Info</button>
            <button className="btn btn-ghost btn-sm" onClick={() => toast.success('DSSR compiled for 01 Jul', { title: 'Report ready' })}>With title</button>
          </div>
        </Card>
      </Section>

      <Section title="Confirm dialog" description="Promise-based confirmation (replaces window.confirm). Esc cancels, Enter confirms. Use the danger variant for destructive actions.">
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                const ok = await confirm({ title: 'Discard changes?', message: 'Your unsaved edits will be lost.' });
                setLastResult(ok ? 'confirmed' : 'cancelled');
              }}
            >
              Standard confirm
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={async () => {
                const ok = await confirm({ title: 'Delete vehicle?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
                setLastResult(ok ? 'confirmed (danger)' : 'cancelled');
              }}
            >
              Danger confirm
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Last result: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{lastResult}</strong>
            </span>
          </div>
        </Card>
      </Section>

      <Section title="Banners" description="Inline, section-level status messages — the persistent counterpart to a toast. Persistent banners stay until their condition clears (low stock, offline); dismissible banners show a × and hide on click. Severity maps to state colours; supports an optional inline action.">
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Banner severity="danger" actionLabel="View Stock" onAction={() => {}}>
              Tank 1 (Petrol) critically low — 4% · 480 L
            </Banner>
            <Banner severity="warning">
              Tank 2 (Diesel) running low — 12% · 1,440 L
            </Banner>
            <Banner severity="info" title="Offline">
              Working from local cache — changes will sync when you reconnect.
            </Banner>
            <Banner severity="success" dismissible>
              DSSR compiled for 01 Jul. This banner is dismissible.
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
      <Section title="Money formatter" description="Always render currency via inr() — 2-decimal, grouped, ₹ prefix. Never hand-roll toLocaleString for money.">
        <Card>
          <table style={{ width: '100%', maxWidth: 520, borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {[
                { call: 'inr(5000)', out: inr(5000) },
                { call: 'inr(5000.5)', out: inr(5000.5) },
                { call: 'inr(-320.4)', out: inr(-320.4) },
                { call: "formatMoney(1234.5, { symbol: false })", out: formatMoney(1234.5, { symbol: false }) },
                { call: 'formatQty(3210.75)', out: formatQty(3210.75) },
              ].map((r) => (
                <tr key={r.call} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '6px 8px' }}><Mono>{r.call}</Mono></td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-strong)' }}>{r.out}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title="Table pattern" description="Amounts/quantities right-align with the mono font; labels left-align with the sans font. This keeps figures scannable.">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Item</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Qty</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rate</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-strong)' }}>{r.item}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatQty(r.qty)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{inr(r.rate)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-strong)' }}>{inr(r.amount)}</td>
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
  { id: 'overlays', label: 'Overlays' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'data', label: 'Data & Money' },
];

export const DesignSystem: React.FC = () => {
  const [active, setActive] = useState('tokens');
  return (
    <PageLayout
      title="Design System"
      subtitle="Local-only reference for tokens, primitives and patterns. Verify design choices here before applying them to product screens."
      toolbar={<Tabs tabs={TABS} activeId={active} onChange={setActive} aria-label="Design system sections" />}
    >
      {active === 'tokens' && <TokensPanel />}
      {active === 'buttons' && <ButtonsPanel />}
      {active === 'inputs' && <InputsPanel />}
      {active === 'components' && <ComponentsPanel />}
      {active === 'overlays' && <OverlaysPanel />}
      {active === 'feedback' && <FeedbackPanel />}
      {active === 'data' && <DataMoneyPanel />}
    </PageLayout>
  );
};
