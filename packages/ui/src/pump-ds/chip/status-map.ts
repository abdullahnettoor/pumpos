import React from 'react';
import {
  PlayCircle,
  Lock,
  Pencil,
  Check,
  Minus,
  Archive,
  CheckCircle,
  RefreshCw,
  Clock,
  CloudOff,
  AlertTriangle,
  Circle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Hourglass,
  Radio,
  ShieldCheck,
  Ban,
  Scale,
  Truck,
  Unlink,
  CircleSlash,
  KeyRound,
  Wrench,
  CloudUpload,
  type LucideIcon,
} from 'lucide-react';
import { statusPresentation, type PumpState } from '@pump/shared';
import type { ChipTone } from './Chip.js';

/**
 * The PumpOS operational status vocabulary. Every status has exactly one
 * canonical label, tone, and icon so the same state reads identically no
 * matter where in the app it appears. Consumers pass a `status` key to
 * `StatusChip`; the domain knowledge lives here, not in call sites.
 *
 * Variance, handover, shift, day, party and money states take their word and
 * tone from `statusPresentation` in `@pump/shared` (#518), the source mobile
 * renders too; this map only adds the icon.
 *
 * When adding a new status:
 *   1. It must fit one of the four families (lifecycle / sync / financial /
 *      variance). If not, revisit the ontology before adding a fifth.
 *   2. Prefer reusing an existing icon over introducing a novel one.
 *   3. Tones are chosen for *semantics*, not aesthetics — `success` = the
 *      operator can move on, `danger` = requires action, `warning` = worth a
 *      glance, `info` / `neutral` = informational only.
 */
export type PumpStatus =
  // Shared vocabulary (@pump/shared statusPresentation): variance, handover,
  // shift, day, party and money states
  | PumpState
  // Lifecycle
  | 'open'
  /** @deprecated Use `shift-closed` (same word and tone). */
  | 'closed'
  | 'locked'
  /** @deprecated Use `day-draft` (same word and tone). */
  | 'draft'
  | 'active'
  | 'inactive'
  | 'archived'
  // Sync
  | 'synced'
  | 'syncing'
  | 'pending'
  | 'offline'
  | 'sync-failed'
  // Financial
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'overdue'
  | 'settled'
  | 'overpaid'
  // Variance
  | 'variance'
  /** @deprecated Use `short` (reads "Short", red). */
  | 'shortage'
  /** @deprecated Use `surplus` (reads "Surplus", amber). */
  | 'excess'
  | 'balanced';

export interface StatusMeta {
  label: string;
  tone: ChipTone;
  icon: LucideIcon;
  /** Optional: whether this status should pulse a dot (live-ongoing). */
  pulse?: boolean;
  /** Render the label struck through (a voided record). */
  struck?: boolean;
}

/** A shared-vocabulary state with its icon. */
const vocab = (
  state: PumpState,
  icon: LucideIcon,
  extra: Partial<StatusMeta> = {},
): StatusMeta => ({
  ...statusPresentation(state),
  icon,
  ...extra,
});

export const STATUS_MAP: Record<PumpStatus, StatusMeta> = {
  // Lifecycle
  open: { label: 'Open', tone: 'success', icon: PlayCircle },
  /** @deprecated Alias of `shift-closed`. */
  closed: vocab('shift-closed', Lock),
  locked: { label: 'Locked', tone: 'neutral', icon: Lock },
  /** @deprecated Alias of `day-draft`: one word, one colour. */
  draft: vocab('day-draft', Pencil),
  active: vocab('active', Check),
  inactive: vocab('inactive', Minus),
  'no-login': vocab('no-login', KeyRound),
  'station-ready': vocab('station-ready', CheckCircle),
  'station-setup': vocab('station-setup', Wrench),
  'station-not-started': vocab('station-not-started', Circle),
  archived: { label: 'Archived', tone: 'neutral', icon: Archive },

  // Sync
  synced: { label: 'Synced', tone: 'success', icon: CheckCircle },
  syncing: { label: 'Syncing', tone: 'info', icon: RefreshCw, pulse: true },
  // "Pending" is grey wherever it appears (#518: one word, one colour); the
  // pulse says the sync is still in flight.
  pending: vocab('handover-pending', Clock, { pulse: true }),
  offline: { label: 'Offline', tone: 'neutral', icon: CloudOff },
  'sync-failed': { label: 'Sync failed', tone: 'danger', icon: AlertTriangle },
  // A write in flight (#606); the outbox's "Waiting to sync" will sit beside it.
  saving: vocab('saving', CloudUpload, { pulse: true }),
  // A fuel price waiting for its effective time (#619).
  'price-scheduled': vocab('price-scheduled', Clock),
  // A fuel with no price in effect: a shift cannot open (#630).
  'price-no-rate': vocab('price-no-rate', AlertCircle),

  // Financial
  paid: { label: 'Paid', tone: 'success', icon: CheckCircle },
  partial: { label: 'Partial', tone: 'warning', icon: Circle },
  unpaid: { label: 'Unpaid', tone: 'warning', icon: AlertCircle },
  overdue: vocab('overdue', AlertTriangle),
  'over-limit': vocab('over-limit', AlertCircle),
  voided: vocab('voided', Ban),
  adjustment: vocab('adjustment', Scale),
  'awaiting-decantation': vocab('awaiting-decantation', Hourglass),
  settled: { label: 'Settled', tone: 'success', icon: CheckCircle },
  overpaid: { label: 'Overpaid', tone: 'info', icon: TrendingUp },

  // Variance
  variance: { label: 'Variance', tone: 'danger', icon: AlertTriangle },
  /** @deprecated Alias of `short`. */
  shortage: vocab('short', TrendingDown),
  /** @deprecated Alias of `surplus`: amber everywhere (#518). */
  excess: vocab('surplus', TrendingUp),
  balanced: vocab('balanced', Check),
  surplus: vocab('surplus', TrendingUp),
  short: vocab('short', TrendingDown),

  // Handover
  'handover-pending': vocab('handover-pending', Clock),
  'handover-due': vocab('handover-due', Hourglass),
  'handover-recorded': vocab('handover-recorded', CheckCircle),

  // Shift
  'shift-live': vocab('shift-live', Radio, { pulse: true }),
  'shift-past-end': vocab('shift-past-end', AlertTriangle),
  'shift-closed': vocab('shift-closed', Lock),

  // Business Day / DSSR
  'day-open': vocab('day-open', PlayCircle),
  'day-draft': vocab('day-draft', Pencil),
  'day-sealed': vocab('day-sealed', Lock),
  'day-final': vocab('day-final', ShieldCheck),

  // Tank (#536)
  'tank-critical': vocab('tank-critical', AlertTriangle),
  'tank-low': vocab('tank-low', AlertCircle),
  'tank-over-capacity': vocab('tank-over-capacity', TrendingUp),
  'tank-waiting-decantation': vocab('tank-waiting-decantation', Truck),

  // Product stock (#536)
  'out-of-stock': vocab('out-of-stock', CircleSlash),
  oversold: vocab('oversold', AlertCircle),

  // Decantation (#536)
  'decantation-draft': vocab('decantation-draft', Pencil),
  'pending-measurement': vocab('pending-measurement', Hourglass),
  measured: vocab('measured', CheckCircle),
  discarded: vocab('discarded', Ban),
  'purchase-not-linked': vocab('purchase-not-linked', Unlink),
  'tanker-matches': vocab('tanker-matches', Check),
  'within-tolerance': vocab('within-tolerance', Minus),
};
