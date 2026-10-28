import React from 'react';
import { isDayShiftsDone, shiftWorkspaceAction } from '@pump/shared';
import { principalFor } from '../../../access/effectivePrincipal.js';
import { Eye, Play, Plus } from 'lucide-react';
import { Button, PageHeader } from '../../../pump-ds/index.js';
import { useDashboardSummary, useShiftTemplates } from '../../../query/hooks.js';
import { useDashboard } from './DashboardContext.js';
import { formatClockInZone, formatHHMM, formatShortDay } from '../../../utils/format.js';

/**
 * "Dashboard" + the business-day line + a single shift action. No day stepper,
 * no Cash drop. The action label needs to know if a shift is open; that read
 * is the header's own query and never blocks the header (falls back to
 * "Shift workspace").
 */
export const DashboardHeader: React.FC = () => {
  const { station, role, now, businessDate, dayStartsAt, timeZone, onNavigate } = useDashboard();
  const action = shiftWorkspaceAction(principalFor(role));
  const summary = useDashboardSummary(station.id, { enabled: action !== null });

  const templates = useShiftTemplates({ enabled: action === 'act' });

  const hasOpenShift = !!summary.data?.activeShift;
  // Same rule as the Forecourt card: once the day's shifts are done there is
  // nothing to open, so the action is the workspace, not "Open shift".
  const dayDone =
    !!summary.data &&
    !!templates.data &&
    isDayShiftsDone({
      now,
      shifts: (summary.data.today?.shifts ?? []).map((s) => ({
        shiftTemplateId: String(s.shiftTemplateId),
        openedAt: s.openedAt,
        closedAt: s.closedAt ?? null,
      })),
      templates: templates.data.map((t) => ({
        id: String(t.id),
        name: String(t.name),
        startTime: String(t.startTime),
        endTime: String(t.endTime),
        isActive: t.isActive !== false,
      })),
      timeZone,
      dayStartsAt,
    });
  const canOpen = !!summary.data && !hasOpenShift && !dayDone;
  // "as of" is when the live data last arrived, not the wall clock: it must
  // not claim freshness the cards don't have. The dashboard summary feeds the
  // Forecourt, timeline and sales figures and refetches with them.
  const asOf = summary.dataUpdatedAt > 0 ? summary.dataUpdatedAt : now;
  const subtitle = `Business day ${formatShortDay(businessDate)} · open since ${formatHHMM(dayStartsAt)} · as of ${formatClockInZone(asOf, timeZone)}`;

  return (
    <PageHeader
      title="Dashboard"
      subtitle={subtitle}
      actions={
        action === 'view' ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Eye />}
            onClick={() => onNavigate('/shifts')}
          >
            View shift
          </Button>
        ) : action === 'act' ? (
          <Button
            variant="primary"
            size="sm"
            leftIcon={canOpen ? <Plus /> : <Play />}
            onClick={() => onNavigate('/shifts')}
          >
            {canOpen ? 'Open shift' : 'Shift workspace'}
          </Button>
        ) : undefined
      }
    />
  );
};
