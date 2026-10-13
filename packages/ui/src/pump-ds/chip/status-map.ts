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
  | 'closed'
  | 'locked'
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
  | 'shortage'
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
  closed: { label: 'Closed', tone: 'neutral', icon: Lock },
  locked: { label: 'Locked', tone: 'neutral', icon: Lock },
  draft: { label: 'Draft', tone: 'neutral', icon: Pencil },
  active: vocab('active', Check),
  inactive: vocab('inactive', Minus),
  archived: { label: 'Archived', tone: 'neutral', icon: Archive },

  // Sync
  synced: { label: 'Synced', tone: 'success', icon: CheckCircle },
  syncing: { label: 'Syncing', tone: 'info', icon: RefreshCw, pulse: true },
  pending: { label: 'Pending', tone: 'warning', icon: Clock, pulse: true },
  offline: { label: 'Offline', tone: 'neutral', icon: CloudOff },
  'sync-failed': { label: 'Sync failed', tone: 'danger', icon: AlertTriangle },

  // Financial
  paid: { label: 'Paid', tone: 'success', icon: CheckCircle },
  partial: { label: 'Partial', tone: 'warning', icon: Circle },
  unpaid: { label: 'Unpaid', tone: 'warning', icon: AlertCircle },
  overdue: vocab('overdue', AlertTriangle),
  'over-limit': vocab('over-limit', AlertCircle),
  voided: vocab('voided', Ban),
  settled: { label: 'Settled', tone: 'success', icon: CheckCircle },
  overpaid: { label: 'Overpaid', tone: 'info', icon: TrendingUp },

  // Variance
  variance: { label: 'Variance', tone: 'danger', icon: AlertTriangle },
  shortage: { label: 'Shortage', tone: 'danger', icon: TrendingDown },
  // A surplus is amber everywhere (#518): cash or stock that should be explained.
  excess: { label: 'Excess', tone: 'warning', icon: TrendingUp },
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
};
