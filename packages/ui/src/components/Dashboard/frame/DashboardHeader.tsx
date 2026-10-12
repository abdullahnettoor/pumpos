import React, { useEffect, useState } from 'react';
import { shiftWorkspaceAction } from '@pump/shared';
import { Eye, Play, Plus } from 'lucide-react';
import { Button, PageHeader } from '../../../pump-ds/index.js';
import { useDashboardSummary } from '../../../query/hooks.js';
import { useDashboard } from './DashboardContext.js';
import { formatAsOf, formatDashboardDate, formatDayStart } from './headerText.js';

/**
 * "Dashboard" + the business-day line + a single shift action. No day stepper,
 * no Cash drop. The action label needs to know if a shift is open; that read
 * is the header's own query and never blocks the header (falls back to
 * "Shift workspace").
 */
export const DashboardHeader: React.FC = () => {
  const { station, role, businessDate, dayStartsAt, timeZone, onNavigate } = useDashboard();
  const action = shiftWorkspaceAction(role);
  const summary = useDashboardSummary(station.id, { enabled: action !== null });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const hasOpenShift = !!summary.data?.activeShift;
  const subtitle = `Business day ${formatDashboardDate(businessDate)} · open since ${formatDayStart(dayStartsAt)} · as of ${formatAsOf(now, timeZone)}`;

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
            leftIcon={summary.data && !hasOpenShift ? <Plus /> : <Play />}
            onClick={() => onNavigate('/shifts')}
          >
            {summary.data && !hasOpenShift ? 'Open shift' : 'Shift workspace'}
          </Button>
        ) : undefined
      }
    />
  );
};
