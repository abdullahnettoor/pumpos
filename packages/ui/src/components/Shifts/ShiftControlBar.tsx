import React from 'react';
import { inr } from '../../utils/format.js';
import { Clock3, FileText, Fuel, Receipt, ShoppingBag, ShoppingCart, Wallet } from 'lucide-react';
import { Button, Chip } from '../../pump-ds/index.js';

type QuickAction = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hotkey?: string;
};

interface ShiftControlBarProps {
  activeShift: any;
  shiftTotals: {
    cashCollections: number;
    cashExpenses: number;
    cardCollections: number;
    upiCollections: number;
    creditSales: number;
    expenseCount: number;
    purchaseCount: number;
    purchaseTotal: number;
  };
  handoversCompleted: number;
  handoversAssigned: number;
  quickActions: QuickAction[];
  onCloseShiftClick: () => void;
  onViewLastShiftSummary?: () => void;
  isPreparingClose: boolean;
}

function formatElapsed(openedAt: string): string {
  const opened = new Date(openedAt).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - opened);
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const iconForKey = (key: string) => {
  switch (key) {
    case 'expense':
      return <Receipt size={12} />;
    case 'collection':
      return <Wallet size={12} />;
    case 'credit-sale':
      return <Fuel size={12} />;
    case 'merchandise-sale':
      return <ShoppingBag size={12} />;
    case 'purchase':
      return <ShoppingCart size={12} />;
    default:
      return null;
  }
};

export const ShiftControlBar: React.FC<ShiftControlBarProps> = ({
  activeShift,
  shiftTotals,
  handoversCompleted,
  handoversAssigned,
  quickActions,
  onCloseShiftClick,
  onViewLastShiftSummary,
  isPreparingClose,
}) => {
  const elapsed = formatElapsed(activeShift.openedAt);
  const openedAtShort = formatTime(activeShift.openedAt);
  const allHandoversDone =
    handoversAssigned > 0 && handoversCompleted >= handoversAssigned;
  const closePromoted = allHandoversDone || isPreparingClose;

  return (
    <div className="shift-control-bar card animate-fade-in">
      <div className="shift-control-bar__inline">
        <div className="shift-control-bar__cluster shift-control-bar__identity">
          {isPreparingClose && <Chip tone="warning" size="sm">Closing</Chip>}
          <strong style={{ fontSize: '13px', color: 'var(--text-strong)' }}>
            {activeShift.templateName}
          </strong>
          <span className="shift-control-bar__meta">
            <Clock3 size={11} /> {openedAtShort} · {elapsed}
          </span>
          <span className="shift-control-bar__meta">
            Float{' '}
            <strong className="font-mono">
              {inr(activeShift.openingCash)}
            </strong>
          </span>
        </div>

        <div className="shift-control-bar__cluster shift-control-bar__actions">
          {quickActions.map((action) => (
            <Button
              key={action.key}
              variant="secondary"
              size="sm"
              leftIcon={iconForKey(action.key)}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.hotkey ? `${action.label} (press ${action.hotkey})` : action.label}
            >
              {action.label}
              {action.hotkey && (
                <kbd className="shift-control-bar__hotkey">{action.hotkey}</kbd>
              )}
            </Button>
          ))}
        </div>

        <div className="shift-control-bar__cluster shift-control-bar__close">
          {onViewLastShiftSummary && (
            <Button variant="ghost" size="sm" iconOnly leftIcon={<FileText />} onClick={onViewLastShiftSummary} title="Last shift summary" aria-label="Last shift summary" />
          )}
          <Button variant={closePromoted ? 'primary' : 'secondary'} size="sm" onClick={onCloseShiftClick} title={closePromoted ? 'Ready to close' : 'Begin close review'}>
            {isPreparingClose ? 'Continue Close' : 'Begin Close →'}
          </Button>
        </div>
      </div>
    </div>
  );
};
