# Product

## Register

product

## Platform

web

## Users

**Primary — Pump operators (desktop, Tauri shell).** Frontline staff running shifts at Indian fuel retail stations. On their feet, often under time pressure at shift change, entering nozzle readings, cash counts, expenses, and credit sales. They live inside a single active shift for hours at a time. Many are keyboard-first once trained. Network is unreliable; the app must keep working offline and reconcile later.

**Secondary — Station managers (desktop + web).** Review DSSR (Daily Station Sales Report), reconcile variances, manage products/customers/suppliers, chase outstanding receivables, run station setup. They alternate between review workflows and administrative tasks.

**Tertiary — Owners (web, mobile view later).** Cross-station oversight: performance, exceptions, outstanding balances, monthly reports. Read-mostly, decision-oriented.

The job to be done, in order of frequency: open/close shifts cleanly, record every rupee that moved (fuel, manual sales, expenses, purchases, collections, credit sales), see variance the moment it appears, and close the business day with a snapshot that will never lie later.

## Product Purpose

PumpOS is the operating system for fuel retail. It replaces the spreadsheet + Tally + WhatsApp stack that most Indian fuel stations run today with a single, event-driven, multi-tenant platform anchored on the two truths of the business: the **business day** and the **shift**.

Success looks like:

- An operator can open a shift, work through it, and close it with drawer reconciliation in under a minute of ceremony.
- A manager can trust the DSSR the day after — and the year after — because snapshots are immutable and every number traces back to an auditable event.
- An owner sees today's numbers across every station without asking anyone.
- The system stays honest offline and reconciles without duplicates when the network returns.

This is explicitly **not** a POS, **not** a general accounting package, and **not** a marketing website. It is an operational instrument.

## Brand Personality

Three words: **precise, practical, confident.**

- **Voice:** direct, unadorned, operator-first. Short labels. Numbers over adjectives. No exclamation marks. No "Welcome back!" copy.
- **Emotional target:** the calm of a well-labeled instrument panel. Trust under pressure. The interface should feel *familiar on first use, fast after one day, and unshakeable during a shortage investigation.*
- **Not:** casual, playful, luxury-marketing, "delightful" in the SaaS sense. Premium is earned through restraint and correctness, not decoration.

The design language name we use internally is **"Calm Industrial Precision"** (see [docs/PUMP-ERP-DESIGN-SYSTEM.md](docs/PUMP-ERP-DESIGN-SYSTEM.md)). Petrol green as the committed brand color; the rest of the surface is disciplined light neutrals.

## Anti-references

Refuse these on sight:

- **SAP, Tally, Busy, Marg** — the traditional ERP look. Dense the wrong way: grey chrome, tiny 10px fonts, modal-inside-modal, ribbon toolbars, no visual hierarchy. Our density is compact + clear, not cramped + hostile.
- **Purple-gradient SaaS dashboards** — the Stripe-clone, Notion-clone, Linear-clone aesthetic *when applied to an operator tool.* We admire those products; we do not mimic their marketing surface for a station-floor interface.
- **Toy-like rounded UI** — 24/28/32px card radii, oversized pill buttons, playful illustrations. Wrong register for someone reconciling a ₹47 shortage.
- **Glassmorphism, decorative gradients, animated hero backgrounds** — pure decoration on a task surface.
- **Dark-mode-first aesthetics.** A dark mode may ship later; the *default* aesthetic is light. Fuel stations are lit for daytime operations.
- **Motion that slows work.** No staggered dashboard reveals, no scroll-jacked sections, no page-load choreography. Transitions convey state (150–200ms), nothing else.
- **Oversized empty layouts** — huge hero cards with a single number and a gradient. Real operators need six meaningful numbers at a glance, not one giant one.
- **"AI-designed cream/sand/beige body backgrounds"** — warm-neutral tinted near-whites, the current AI monoculture. Our body canvas is `#F6F7F4` — a subtle cool-warm neutral biased toward the brand's own petrol-green hue, not a beige default.

## Design Principles

1. **Business-day + shift are the anchors, not the chrome.** Active shift status, station, sync state, and drawer context are always visible in the shell. Every screen orients relative to the current shift.
2. **One primary action per screen.** Open shift. Enter expense. Close shift. Generate DSSR. Secondary actions never outweigh the primary.
3. **Status before decoration.** Open / closed / synced / pending / offline / variance / overdue — these states are first-class citizens in headers, rows, drawers, and summaries. Decoration is what's left when status is handled.
4. **Dense, not busy.** Compact controls, tight tables, disciplined 4px-grid spacing, short labels. Density is a feature for professionals; the enemy is *cramped*, not *dense*.
5. **List → Drawer → Edit.** Right-side contextual drawers, not modal stacks. The user never loses their place in the underlying list.
6. **Keyboard-friendly by default.** Strong tab order, visible focus, predictable form flow. This is an operator tool, not a browsing product.
7. **Snapshots don't lie.** Shift Summary and DSSR, once generated, are immutable. The UI communicates that promise (locked states, "generated on" timestamps, no in-place edits on closed periods).

## Accessibility & Inclusion

**Baseline: WCAG 2.2 AA.**

- Body text ≥4.5:1 against its background; large text ≥3:1. Verified against the token palette in `packages/ui/src/index.css`.
- Focus states already implemented: 2px `--brand-primary` outline with 2px offset on all interactive elements via `:focus-visible`.
- `prefers-reduced-motion: reduce` must be honored on every animated transition; transitions are already short (100–200ms) and non-decorative.
- Numeric data uses IBM Plex Mono for legibility and tabular alignment; currency and quantity fields are right-aligned.
- Placeholder text held to the same 4.5:1 contrast rule as body — no muted-gray placeholders on tinted backgrounds.
- Keyboard reachability for every mutating action; no mouse-only affordances.
- Screen-reader labels on icon-only controls (sync indicator, drawer close, row actions).

Language: **English (India)** is the primary locale; number formatting uses Indian grouping (₹1,23,456.78) and dates default to `DD MMM YYYY`. Multi-locale is out of scope for MVP but the copy layer should stay lint-clean of hard-coded formatting.

Known operator context to design for:

- Bright ambient lighting (station-office glare) → light theme is not just aesthetic, it's ergonomic.
- Older Windows laptops with mediocre displays → do not rely on hairline 1px separators or sub-pixel weight differences.
- Intermittent connectivity → every network-dependent affordance shows sync state honestly; no silent failures.
