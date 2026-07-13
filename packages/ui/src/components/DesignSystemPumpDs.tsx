import React, { useState } from 'react';
import {
  Chip,
  StatusChip,
  STATUS_MAP,
  Dot,
  Delta,
  KpiTile,
  KpiStrip,
  Button,
  PageHeader,
  Panel,
  EmptyState,
  MeterRow,
  BreakdownBar,
  Sparkline,
  type PumpStatus,
  type ChipTone,
  type ChipVariant,
  type ChipSize,
  type DotTone,
  type DotSize,
  type ButtonVariant,
  type ButtonSize,
} from '../pump-ds/index.js';
import { Fuel, User, Building2, Truck, Info, ShieldCheck, Plus, Download, Trash2, Play, ArrowRight, Inbox, Droplet, TrendingUp } from 'lucide-react';

/**
 * pump-ds showcase — the real design system living surface. Each pump-ds
 * primitive gets its own section here as it lands. Purely a browsing aid;
 * lives only in local dev via the DesignSystem route.
 */

const Row: React.FC<{ label: string; children: React.ReactNode; note?: string }> = ({ label, children, note }) => (
  <div className="grid grid-cols-[140px_1fr_auto] items-center gap-4 border-b border-border-soft py-3 last:border-b-0">
    <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">{label}</div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
    {note && <div className="font-mono text-[10px] text-ink-faint">{note}</div>}
  </div>
);

const Group: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="mb-10">
    <header className="mb-4">
      <div className="text-[13px] font-semibold uppercase tracking-wider text-ink-strong">{title}</div>
      {description && <p className="mt-1.5 max-w-[620px] text-[12.5px] leading-relaxed text-ink-muted">{description}</p>}
    </header>
    <div className="rounded-card border border-border-soft bg-surface px-5 py-2">{children}</div>
  </section>
);

// ---------------- Chip · matrix ----------------

const TONES: ChipTone[] = ['brand', 'info', 'success', 'warning', 'danger', 'neutral'];
const VARIANTS: ChipVariant[] = ['soft', 'outline', 'solid'];

const ChipMatrix: React.FC = () => (
  <div>
    {VARIANTS.map((variant) => (
      <Row key={variant} label={`variant=${variant}`}>
        {TONES.map((tone) => (
          <Chip key={tone} tone={tone} variant={variant}>{tone}</Chip>
        ))}
      </Row>
    ))}
  </div>
);

const ChipSizes: React.FC = () => (
  <div>
    {(['xs', 'sm', 'md'] as ChipSize[]).map((size) => (
      <Row key={size} label={`size=${size}`}>
        <Chip size={size} tone="brand" variant="soft">soft</Chip>
        <Chip size={size} tone="brand" variant="outline">outline</Chip>
        <Chip size={size} tone="brand" variant="solid">solid</Chip>
        <Chip size={size} tone="info" icon={<Info />}>with icon</Chip>
        <Chip size={size} tone="warning" dot pulse>with pulse dot</Chip>
        <Chip size={size} tone="danger" icon={<ShieldCheck />}>hazmat</Chip>
      </Row>
    ))}
  </div>
);

const ChipAdornments: React.FC = () => {
  const [filters, setFilters] = useState(['Fuel: HSD', 'Payment: UPI', 'Range: 7 days']);
  return (
    <div>
      <Row label="icon">
        <Chip tone="brand" icon={<Fuel />}>HSD</Chip>
        <Chip tone="info" icon={<User />}>Fleet customer</Chip>
        <Chip tone="warning" icon={<Truck />}>Fleet supplier</Chip>
        <Chip tone="neutral" icon={<Building2 />}>Head office</Chip>
      </Row>
      <Row label="dot">
        <Chip tone="success" dot>Live</Chip>
        <Chip tone="warning" dot pulse>Pending</Chip>
        <Chip tone="danger" dot pulse>Failing</Chip>
        <Chip tone="neutral" dot>Idle</Chip>
      </Row>
      <Row label="removable" note="onRemove wires a close button with its own focus ring">
        {filters.length === 0 && <span className="text-[11px] text-ink-faint">No filters</span>}
        {filters.map((label) => (
          <Chip key={label} tone="info" onRemove={() => setFilters((cs) => cs.filter((c) => c !== label))}>
            {label}
          </Chip>
        ))}
      </Row>
    </div>
  );
};

// ---------------- Dot · matrix ----------------

const DotMatrix: React.FC = () => {
  const tones: DotTone[] = ['brand', 'info', 'success', 'warning', 'danger', 'neutral'];
  const sizes: DotSize[] = ['xs', 'sm', 'md', 'lg'];
  return (
    <div>
      {sizes.map((s) => (
        <Row key={s} label={`size=${s}`}>
          {tones.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
              <Dot tone={t} size={s} />
              <span>{t}</span>
            </span>
          ))}
        </Row>
      ))}
      <Row label="pulse" note="motion-safe:animate-pulse — reduced-motion users get a static dot">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"><Dot tone="brand"   size="md" pulse /> brand</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"><Dot tone="info"    size="md" pulse /> info</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"><Dot tone="success" size="md" pulse /> success</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"><Dot tone="warning" size="md" pulse /> warning</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"><Dot tone="danger"  size="md" pulse /> danger</span>
      </Row>
    </div>
  );
};

// ---------------- Delta · matrix ----------------

const DeltaMatrix: React.FC = () => (
  <div>
    <Row label="direction" note="auto-derived from value's sign when omitted">
      <Delta value="12.4%" />
      <Delta value="-3.1%" />
      <Delta value="matched" direction="flat" />
      <Delta value="+₹8,240" />
      <Delta value="−₹1,240" />
    </Row>
    <Row label="invert" note="down-is-good metrics: outstanding falling, variance shrinking">
      <Delta value="3.1%" direction="down" invert />
      <Delta value="12.4%" direction="up" invert />
    </Row>
    <Row label="sizes">
      <Delta value="12.4%" size="xs" />
      <Delta value="12.4%" size="sm" />
      <Delta value="12.4%" size="md" />
      <Delta value="-3.1%" size="xs" />
      <Delta value="-3.1%" size="sm" />
      <Delta value="-3.1%" size="md" />
    </Row>
    <Row label="no arrow" note="rare — for when the sign is already in the value">
      <Delta value="+12.4%" showArrow={false} />
      <Delta value="-3.1%" showArrow={false} />
      <Delta value="—" direction="flat" showArrow={false} />
    </Row>
  </div>
);

// ---------------- KpiStrip · composite ----------------

const KpiStripShowcase: React.FC = () => (
  <div className="space-y-6 py-2">
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        five-metric operator dashboard header (auto-fit; wraps cleanly on narrow widths)
      </div>
      <KpiStrip>
        <KpiTile
          dot="brand"
          label="Sales today"
          value="₹4,82,350.00"
          delta={{ value: '12.4%', direction: 'up' }}
          hint="vs yest."
        />
        <KpiTile
          dot="success"
          label="Cash in drawer"
          value="₹1,84,260.00"
          delta={{ value: 'matched', direction: 'flat' }}
        />
        <KpiTile
          dot="warning"
          label="Variance"
          value="−₹1,240"
          valueTone="warning"
          hint="2 tanks over 0.5%"
        />
        <KpiTile
          dot="info"
          label="Outstanding"
          value="₹21,48,930.00"
          delta={{ value: '3.1%', direction: 'down', invert: true }}
          hint="7d"
        />
        <KpiTile
          dot="neutral"
          label="Pending sync"
          value="4"
          hint="retry in 12s"
        />
      </KpiStrip>
    </div>

    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        fixed 4-column grid (drawer / detail panel header)
      </div>
      <KpiStrip columns={4}>
        <KpiTile size="sm" dot="brand"   label="Volume sold"    value="3,210.75" delta={{ value: '4.8%', direction: 'up' }} />
        <KpiTile size="sm" dot="success" label="Cash collected" value="₹1,84,260" />
        <KpiTile size="sm" dot="info"    label="UPI collected"  value="₹92,140"   delta={{ value: '18.2%', direction: 'up' }} />
        <KpiTile size="sm" dot="warning" label="Card declined"  value="2"         hint="₹8,420 retry" />
      </KpiStrip>
    </div>

    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        one prominent tile (page header / drawer opener)
      </div>
      <KpiStrip columns={2}>
        <KpiTile
          size="lg"
          dot="brand"
          label="Business day · 09 Jul"
          value="₹18,42,000.00"
          delta={{ value: '8.6%', direction: 'up' }}
          hint="vs 30-day avg"
        />
        <KpiTile
          size="lg"
          dot="danger"
          label="Overdue receivables"
          value="₹23,26,920"
          valueTone="danger"
          delta={{ value: '2.4%', direction: 'up', invert: true }}
          hint="12 accounts"
        />
      </KpiStrip>
    </div>
  </div>
);

// ---------------- Button · matrix ----------------

const ButtonMatrix: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const variants: ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'danger'];
  const sizes: ButtonSize[] = ['xs', 'sm', 'md', 'lg'];
  return (
    <div>
      {variants.map((v) => (
        <Row key={v} label={`variant=${v}`}>
          <Button variant={v} size="sm">Label</Button>
          <Button variant={v} size="sm" leftIcon={<Plus />}>New</Button>
          <Button variant={v} size="sm" rightIcon={<ArrowRight />}>Next</Button>
          <Button variant={v} size="sm" disabled>Disabled</Button>
        </Row>
      ))}
      <Row label="sizes" note="xs 28 · sm 32 · md 36 · lg 40">
        {sizes.map((s) => (
          <Button key={s} variant="primary" size={s} leftIcon={<Play />}>{s.toUpperCase()}</Button>
        ))}
      </Row>
      <Row label="icon-only" note="square; always pair with aria-label">
        {sizes.map((s) => (
          <Button key={s} variant="secondary" size={s} iconOnly aria-label="Download"><Download /></Button>
        ))}
        <Button variant="danger" size="sm" iconOnly aria-label="Delete"><Trash2 /></Button>
        <Button variant="ghost" size="sm" iconOnly aria-label="Add"><Plus /></Button>
      </Row>
      <Row label="loading" note="spinner swaps in, width stays stable, clicks blocked">
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1600); }}
        >
          {loading ? 'Saving…' : 'Click to load'}
        </Button>
        <Button variant="secondary" size="sm" loading>Loading</Button>
        <Button variant="danger" size="sm" loading iconOnly aria-label="Deleting"><Trash2 /></Button>
      </Row>
      <Row label="full width">
        <div className="w-full max-w-[280px]">
          <Button variant="primary" size="md" fullWidth leftIcon={<Play />}>Open shift</Button>
        </div>
      </Row>
    </div>
  );
};

const ButtonInContext: React.FC = () => (
  <div className="space-y-4 py-2">
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">drawer footer (one primary action, one secondary)</div>
      <div className="flex items-center justify-end gap-2 rounded-card border border-border-soft bg-surface px-4 py-3">
        <Button variant="ghost" size="sm">Cancel</Button>
        <Button variant="primary" size="sm" leftIcon={<Plus />}>Create expense</Button>
      </div>
    </div>
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">destructive confirm (danger primary + safe escape)</div>
      <div className="flex items-center justify-end gap-2 rounded-card border border-border-soft bg-surface px-4 py-3">
        <Button variant="secondary" size="sm">Keep shift open</Button>
        <Button variant="danger" size="sm" leftIcon={<Trash2 />}>Void shift</Button>
      </div>
    </div>
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">toolbar (xs ghost + icon-only cluster)</div>
      <div className="flex items-center gap-1.5 rounded-card border border-border-soft bg-surface px-3 py-2">
        <Button variant="ghost" size="xs" leftIcon={<Download />}>Export</Button>
        <Button variant="ghost" size="xs" iconOnly aria-label="Refresh"><ArrowRight /></Button>
        <div className="mx-1 h-5 w-px bg-border-soft" />
        <Button variant="primary" size="xs" leftIcon={<Plus />}>Add row</Button>
      </div>
    </div>
  </div>
);

// ---------------- StatusChip · vocabulary ----------------
const STATUS_GROUPS: { label: string; statuses: PumpStatus[] }[] = [
  { label: 'lifecycle', statuses: ['open', 'closed', 'locked', 'draft', 'active', 'inactive', 'archived'] },
  { label: 'sync',      statuses: ['synced', 'syncing', 'pending', 'offline', 'sync-failed'] },
  { label: 'financial', statuses: ['paid', 'partial', 'unpaid', 'overdue', 'settled', 'overpaid'] },
  { label: 'variance',  statuses: ['balanced', 'excess', 'shortage', 'variance'] },
];

const StatusVocabulary: React.FC = () => (
  <div>
    {STATUS_GROUPS.map((g) => (
      <Row key={g.label} label={g.label}>
        {g.statuses.map((s) => <StatusChip key={s} status={s} />)}
      </Row>
    ))}
  </div>
);

const StatusInContext: React.FC = () => (
  <div className="space-y-6 py-2">
    {/* A short shift-list row using StatusChip and Chip together. */}
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">shift list row</div>
      <div className="divide-y divide-border-soft rounded-card border border-border-soft bg-surface">
        {[
          { id: 'SHIFT-4128', operator: 'Rekha M.', status: 'open' as PumpStatus,   sync: 'syncing' as PumpStatus, sales: '₹2,84,120' },
          { id: 'SHIFT-4127', operator: 'Anish K.',  status: 'closed' as PumpStatus, sync: 'synced' as PumpStatus,  sales: '₹4,12,940' },
          { id: 'SHIFT-4126', operator: 'Priya D.',  status: 'closed' as PumpStatus, sync: 'pending' as PumpStatus, sales: '₹3,08,220' },
          { id: 'SHIFT-4125', operator: 'Vinod S.',  status: 'locked' as PumpStatus, sync: 'sync-failed' as PumpStatus, sales: '₹2,96,410' },
        ].map((r) => (
          <div key={r.id} className="grid grid-cols-[120px_1fr_auto_auto_120px] items-center gap-4 px-4 py-2.5 text-[13px]">
            <span className="font-mono text-[11px] text-ink-muted">{r.id}</span>
            <span className="text-ink-strong">{r.operator}</span>
            <StatusChip status={r.status} size="xs" />
            <StatusChip status={r.sync} size="xs" showIcon={false} />
            <span className="text-right font-mono font-medium text-ink-strong">{r.sales}</span>
          </div>
        ))}
      </div>
    </div>

    {/* A customers-list row showing overdue + partial payment states. */}
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">receivables row</div>
      <div className="divide-y divide-border-soft rounded-card border border-border-soft bg-surface">
        {[
          { name: 'Karnataka State RTC',    code: 'KSR-041', status: 'overdue' as PumpStatus, days: '12d', balance: '₹12,84,320' },
          { name: 'Sunrise Logistics Pvt',  code: 'SUN-018', status: 'overdue' as PumpStatus, days: '38d', balance: '₹9,42,600' },
          { name: 'Green Fields Farms',     code: 'GRF-007', status: 'partial' as PumpStatus, days: '2d',  balance: '₹12,450' },
          { name: 'Metro Cabs Union',       code: 'MCU-102', status: 'settled' as PumpStatus, days: '—',   balance: '₹0' },
        ].map((r) => (
          <div key={r.code} className="grid grid-cols-[1fr_auto_auto_140px] items-center gap-4 px-4 py-2.5 text-[13px]">
            <div className="min-w-0">
              <div className="truncate text-ink-strong">{r.name}</div>
              <div className="truncate font-mono text-[11px] text-ink-muted">{r.code}</div>
            </div>
            <StatusChip status={r.status} size="xs" label={r.status === 'overdue' ? `Overdue ${r.days}` : undefined} />
            <span className="w-16 text-right font-mono text-[11px] text-ink-muted">{r.days}</span>
            <span className="text-right font-mono font-medium text-ink-strong">{r.balance}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ---------------- Dashboard building blocks ----------------

const DashboardBlocks: React.FC = () => (
  <div className="space-y-6">
    {/* PageHeader */}
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">PageHeader · title + subtitle + actions + meta</div>
      <div className="rounded-card border border-border-soft bg-surface p-4">
        <PageHeader
          title="Dashboard"
          subtitle="New Test Station · business day 10 Jul"
          meta={<><StatusChip status="open" size="xs" /><Chip tone="neutral" size="xs">Manager</Chip></>}
          actions={<><Button variant="secondary" size="sm" leftIcon={<Download />}>Export</Button><Button variant="primary" size="sm" leftIcon={<Plus />}>New</Button></>}
        />
      </div>
    </div>

    {/* Panel */}
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">Panel · titled surface (header + body + footer)</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Tank levels" icon={<Droplet />} action={<Button variant="ghost" size="xs">View all</Button>}>
          <div className="space-y-3">
            <MeterRow label="Tank 1" sublabel="XP-95" value={7200} max={9000} valueLabel="7,200 / 9,000 L" />
            <MeterRow label="Tank 2" sublabel="HSD" value={320} max={9000} valueLabel="320 / 9,000 L" />
            <MeterRow label="Tank 3" sublabel="MS-9" value={1150} max={9000} valueLabel="1,150 / 9,000 L" />
          </div>
        </Panel>
        <Panel title="Collections today" action={<span className="font-mono text-[12px] font-semibold text-ink-strong">₹3,68,540</span>} footer={<span className="text-[11px] text-ink-muted">Cash reconciled at shift close.</span>}>
          <BreakdownBar
            formatValue={(n) => `₹${n.toLocaleString('en-IN')}`}
            segments={[
              { label: 'Cash', value: 184260, tone: 'success' },
              { label: 'UPI', value: 92140, tone: 'info' },
              { label: 'Card', value: 46820, tone: 'brand' },
              { label: 'Credit', value: 45320, tone: 'warning' },
            ]}
          />
        </Panel>
      </div>
    </div>

    {/* MeterRow tones */}
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">MeterRow · auto-tone (critical &lt;5% · low &lt;15% · else brand)</div>
      <div className="space-y-3 rounded-card border border-border-soft bg-surface p-4">
        <MeterRow label="Healthy" value={7200} max={9000} valueLabel="80%" />
        <MeterRow label="Running low" value={1080} max={9000} valueLabel="12%" />
        <MeterRow label="Critical" value={270} max={9000} valueLabel="3%" />
      </div>
    </div>

    {/* Sparkline */}
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">Sparkline · dependency-free trend (line + optional area fill)</div>
      <div className="flex flex-wrap items-center gap-6 rounded-card border border-border-soft bg-surface p-4">
        {([
          { tone: 'brand' as DotTone, label: 'Sales 7d', data: [42, 48, 45, 61, 58, 72, 69] },
          { tone: 'success' as DotTone, label: 'Volume 7d', data: [30, 32, 31, 38, 40, 44, 47], fill: true },
          { tone: 'danger' as DotTone, label: 'Outstanding', data: [90, 88, 91, 85, 80, 78, 74] },
        ]).map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <Sparkline data={s.data} tone={s.tone} fill={s.fill} aria-label={s.label} />
            <div>
              <div className="text-[12px] font-medium text-ink-strong">{s.label}</div>
              <div className="flex items-center gap-1 text-[11px] text-ink-muted"><TrendingUp className="size-3" /> trend</div>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* EmptyState */}
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">EmptyState · compact (inline) + default (block)</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EmptyState
          compact
          icon={<Inbox />}
          title="No credit sales this shift"
          description="Fleet charges appear here as vehicles fuel up."
          action={<Button variant="secondary" size="xs">Record</Button>}
        />
        <div className="rounded-card border border-border-soft bg-surface">
          <EmptyState
            icon={<Inbox />}
            title="All clear"
            description="Nothing needs your attention right now. Variance, low stock, and overdue accounts will surface here."
          />
        </div>
      </div>
    </div>
  </div>
);

// ---------------- root ----------------

export const DesignSystemPumpDsPanel: React.FC = () => (
  <div>
    <div className="mb-8 rounded-card border border-border-soft bg-surface-alt px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
      <strong className="text-ink-strong">pump-ds · live design system.</strong> Real primitives on the Tailwind
      v4 + token-bridge foundation. Everything here is production-shape — same
      code that will land in <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-ink-strong">pump-ds/</code>
      &nbsp;grows this page. Change a raw value in <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-ink-strong">index.css</code>
      &nbsp;(e.g. <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-ink-strong">--brand-primary</code>) and every chip below
      recolors instantly.
    </div>

    <Group
      title="Chip · matrix"
      description="Six tones × three variants = the whole grid. Tone carries meaning, variant carries emphasis. Soft is the default; use outline for chips inside busy tables; use solid only for the highest-emphasis pin (Overdue, Variance)."
    >
      <ChipMatrix />
    </Group>

    <Group
      title="Chip · sizes"
      description="xs for inline metrics and tab tags · sm for status pills in rows (default) · md for prominent chips (page headers, top of drawers)."
    >
      <ChipSizes />
    </Group>

    <Group
      title="Chip · adornments"
      description="Icons via `icon` prop (leading, normalized to size). Tone dots via `dot` (with optional pulse). Close button via `onRemove` — click bubbles up separately so the chip container stays inert."
    >
      <ChipAdornments />
    </Group>

    <Group
      title="Dot · matrix"
      description="Leaf tone marker. Used inside Chip, KpiTile labels, and anywhere a full status chip would be too heavy. Four sizes for the contexts it lives in; pulse for live/ongoing state (motion-safe)."
    >
      <DotMatrix />
    </Group>

    <Group
      title="Delta · trend indicator"
      description="Compact trend pill for KPIs and metric cells. Direction is auto-derived from the value's sign; pass `invert` for down-is-good metrics (falling outstanding, shrinking variance). The arrow stays truthful; only the tone flips."
    >
      <DeltaMatrix />
    </Group>

    <Group
      title="KpiStrip · composite"
      description="Compact metric row. Uses the `gap-as-divider` technique — 1px gap over a `--border-soft` container background renders as clean dividers on both axes automatically, so wrapping to a second row Just Works. Three variants below cover the common dashboard / drawer / page-header shapes."
    >
      <KpiStripShowcase />
    </Group>

    <Group
      title="Button · matrix"
      description="The single canonical action control. Five variants (primary / secondary / outline / ghost / danger), four sizes (xs 28 · sm 32 · md 36 · lg 40), plus icon-only, loading, and full-width. Replaces the scattered legacy `.btn-*` classes."
    >
      <ButtonMatrix />
    </Group>

    <Group
      title="Button · in context"
      description="Real placements: drawer footer (one primary + one ghost escape), destructive confirm (danger primary + safe secondary), and a toolbar (xs ghost + icon-only cluster). One primary action per surface — never two competing primaries."
    >
      <ButtonInContext />
    </Group>

    <Group
      title="Dashboard building blocks"
      description="The reusable primitives behind the dashboard reframe: PageHeader, Panel, MeterRow (tank gauges), BreakdownBar (collections split), Sparkline (dependency-free trends), and EmptyState. All app-wide, not dashboard-only."
    >
      <DashboardBlocks />
    </Group>

    <Group
      title="StatusChip · vocabulary"
      description="Canonical PumpOS operational states. `status='open'` is the same visual everywhere in the app — no more ad-hoc chip mapping in call sites. Adding a new state = one line in status-map.ts."
    >
      <StatusVocabulary />
    </Group>

    <Group
      title="StatusChip · in real rows"
      description="Two representative surfaces: shift list and receivables. StatusChip with `size='xs'` fits cleanly in dense rows; `showIcon={false}` for extra compact contexts; `label` override for domain-specific phrasing."
    >
      <StatusInContext />
    </Group>
  </div>
);
