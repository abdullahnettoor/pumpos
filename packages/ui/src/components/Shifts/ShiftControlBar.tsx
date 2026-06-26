import React from 'react';
import { Clock3, FileText, Fuel, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import { StatusBadge } from '../StatusBadge.js';

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
  const collectionsTotal =
    shiftTotals.cashCollections + shiftTotals.cardCollections + shiftTotals.upiCollections;
  const allHandoversDone =
    handoversAssigned > 0 && handoversCompleted >= handoversAssigned;
  const closePromoted = allHandoversDone || isPreparingClose;

  return (
    <div className="shift-control-bar card animate-fade-in">
      <div className="shift-control-bar__inline">
        <div className="shift-control-bar__cluster shift-control-bar__identity">
          <StatusBadge
            status={isPreparingClose ? 'CLOSING' : 'OPEN'}
            type={isPreparingClose ? 'warning' : 'success'}
          />
          <strong style={{ fontSize: '13px', color: 'var(--text-strong)' }}>
            {activeShift.templateName}
          </strong>
          <span className="shift-control-bar__meta">
            <Clock3 size={11} /> {openedAtShort} · {elapsed}
          </span>
          <span className="shift-control-bar__meta">
            Float{' '}
            <strong className="font-mono">
              ₹{Number(activeShift.openingCash).toLocaleString('en-IN')}
            </strong>
          </span>
        </div>

        <div className="shift-control-bar__cluster shift-control-bar__actions">
          {quickActions.map((action) => (
            <button
              key={action.key}
              className="btn btn-secondary btn-sm shift-control-bar__action-btn"
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.hotkey ? `${action.label} (press ${action.hotkey})` : action.label}
            >
              {iconForKey(action.key)}
              <span>{action.label}</span>
              {action.hotkey && (
                <kbd className="shift-control-bar__hotkey">{action.hotkey}</kbd>
              )}
            </button>
          ))}
        </div>

        <div className="shift-control-bar__cluster shift-control-bar__kpis">
          <span>
            Coll{' '}
            <strong className="font-mono">
              ₹{collectionsTotal.toLocaleString('en-IN')}
            </strong>
          </span>
          <span>
            Exp{' '}
            <strong className="font-mono">
              ₹{shiftTotals.cashExpenses.toLocaleString('en-IN')}
            </strong>
          </span>
          <span>
            Hand <strong>{handoversCompleted}/{handoversAssigned}</strong>
          </span>
        </div>

        <div className="shift-control-bar__cluster shift-control-bar__close">
          {onViewLastShiftSummary && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={onViewLastShiftSummary}
              title="Last Shift Summary"
            >
              <FileText size={13} />
            </button>
          )}
          <button
            className={closePromoted ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={onCloseShiftClick}
            title={closePromoted ? 'Ready to close' : 'Begin close review'}
          >
            {isPreparingClose ? 'Continue Close' : 'Begin Close →'}
          </button>
        </div>
      </div>
    </div>
  );
};
