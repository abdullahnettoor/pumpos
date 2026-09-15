import React from 'react';
import { AlertTriangle, Check, Play, FileText } from 'lucide-react';
import { Button } from '../../pump-ds/index.js';
import { inr } from '../../utils/format.js';
import { ShiftBusinessDateContext } from './ShiftBusinessDateContext.js';

export interface ShiftCloseResult {
  expectedCash: number;
  closingCash: number;
  variance: number;
  lastClosedShiftId: string;
  nextTemplateId: string;
  businessDate: string;
  currentBusinessDate: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  openedAt: string;
  closedAt: string;
  timeZone?: string;
}

export interface ShiftCloseSuccessProps {
  result: ShiftCloseResult;
  onStartNext: () => void;
  onViewSummary: () => void;
  onBack: () => void;
  tankDips?: Array<{
    tankId: string;
    tankName: string;
    actualQuantity: number;
    status: 'pending' | 'saving' | 'saved' | 'failed';
    error?: string;
    expectedQuantity?: number;
    varianceQuantity?: number;
  }>;
  onSaveTankDips?: () => void | Promise<unknown>;
  onDiscardTankDips?: () => void | Promise<unknown>;
}

/**
 * Post-close confirmation screen: shows the drawer reconciliation outcome
 * (expected vs actual cash + variance) and the next-step actions. Extracted from
 * ShiftsManagement as a presentational leaf.
 */
export const ShiftCloseSuccess: React.FC<ShiftCloseSuccessProps> = ({
  result,
  onStartNext,
  onViewSummary,
  onBack,
  tankDips = [],
  onSaveTankDips,
  onDiscardTankDips,
}) => {
  const hasPendingDips = tankDips.some(
    (dip) => dip.status === 'pending' || dip.status === 'failed',
  );
  const isSavingDips = tankDips.some((dip) => dip.status === 'saving');
  return (
    <div
      className="animate-fade-in card card-comfortable"
      style={{
        maxWidth: '600px',
        margin: '40px auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        textAlign: 'center',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--state-success-bg)',
            color: 'var(--state-success-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={36} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)' }}>
          Shift Closed Successfully
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          The Shift Summary is saved permanently.
        </p>
      </div>

      <div style={{ textAlign: 'left' }}>
        <ShiftBusinessDateContext
          businessDate={result.businessDate}
          currentBusinessDate={result.currentBusinessDate}
          scheduledStartTime={result.scheduledStartTime}
          scheduledEndTime={result.scheduledEndTime}
          openedAt={result.openedAt}
          closedAt={result.closedAt}
          timeZone={result.timeZone}
        />
      </div>

      <div
        style={{
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-input)',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '13px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-surface-alt)',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignSelf: 'stretch',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <span>Expected Safe Cash</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {inr(result.expectedCash)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'stretch',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <span>Actual Closing Cash Entered</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {inr(result.closingCash)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'stretch',
            justifyContent: 'space-between',
            padding: '12px 16px',
            fontWeight: 700,
            color: result.variance === 0 ? 'var(--state-success-fg)' : 'var(--brand-danger)',
          }}
        >
          <span>Cash Variance</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {result.variance > 0 ? '+' : ''}
            {inr(result.variance)}
            {result.variance === 0 ? ' (Perfect Match)' : ''}
          </span>
        </div>
      </div>

      {tankDips.length > 0 && (
        <div
          style={{
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-input)',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--bg-surface-alt)',
              borderBottom: '1px solid var(--border-soft)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>
              Optional Tank Dip
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
              Fuel sales are posted. Save these readings now as a separate Business Day action.
            </div>
          </div>
          {tankDips.map((dip) => (
            <div
              key={dip.tankId}
              style={{
                padding: '9px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--border-soft)',
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{dip.tankName}</div>
                {dip.error && (
                  <div style={{ color: 'var(--state-danger-fg)', marginTop: 2 }}>{dip.error}</div>
                )}
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                <div>{dip.actualQuantity.toFixed(1)} L</div>
                <div
                  style={{
                    color:
                      dip.status === 'saved'
                        ? 'var(--state-success-fg)'
                        : dip.status === 'failed'
                          ? 'var(--state-danger-fg)'
                          : 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {dip.status === 'saved'
                    ? 'Saved'
                    : dip.status === 'saving'
                      ? 'Saving...'
                      : dip.status === 'failed'
                        ? 'Retry required'
                        : 'Ready'}
                </div>
                {dip.status === 'saved' &&
                  dip.expectedQuantity !== undefined &&
                  dip.varianceQuantity !== undefined && (
                    <div
                      style={{
                        marginTop: 2,
                        color:
                          dip.varianceQuantity === 0
                            ? 'var(--text-muted)'
                            : 'var(--state-warning-fg)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 11,
                      }}
                    >
                      Expected {dip.expectedQuantity.toFixed(1)} L · Variance{' '}
                      {dip.varianceQuantity > 0 ? '+' : ''}
                      {dip.varianceQuantity.toFixed(1)} L
                    </div>
                  )}
              </div>
            </div>
          ))}
          {hasPendingDips && onSaveTankDips && (
            <div
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                backgroundColor: 'var(--state-warning-bg)',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: 'var(--state-warning-fg)',
                }}
              >
                <AlertTriangle size={13} /> Shift is closed; unsaved dips remain retryable.
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {onDiscardTankDips && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDiscardTankDips}
                    disabled={isSavingDips}
                  >
                    Discard Unsaved Dips
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onSaveTankDips}
                  loading={isSavingDips}
                >
                  Save Tank Dips
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <Button
          variant="primary"
          size="md"
          leftIcon={<Play size={13} style={{ fill: 'currentColor' }} />}
          onClick={onStartNext}
          disabled={hasPendingDips || isSavingDips}
        >
          Open next Shift
        </Button>
        <Button
          variant="secondary"
          size="md"
          leftIcon={<FileText size={13} />}
          onClick={onViewSummary}
          disabled={hasPendingDips || isSavingDips}
        >
          View Compiled Shift Summary
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={onBack}
          disabled={hasPendingDips || isSavingDips}
        >
          Back to Workspace
        </Button>
      </div>
    </div>
  );
};
