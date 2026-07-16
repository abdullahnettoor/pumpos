import React from 'react';
import { Check, Play, FileText } from 'lucide-react';
import { Button } from '../../pump-ds/index.js';
import { inr } from '../../utils/format.js';

export interface ShiftCloseResult {
  expectedCash: number;
  closingCash: number;
  variance: number;
  lastClosedShiftId: string;
  nextTemplateId: string;
}

export interface ShiftCloseSuccessProps {
  result: ShiftCloseResult;
  onStartNext: () => void;
  onViewSummary: () => void;
  onBack: () => void;
}

/**
 * Post-close confirmation screen: shows the drawer reconciliation outcome
 * (expected vs actual cash + variance) and the next-step actions. Extracted from
 * ShiftsManagement as a presentational leaf.
 */
export const ShiftCloseSuccess: React.FC<ShiftCloseSuccessProps> = ({ result, onStartNext, onViewSummary, onBack }) => {
  return (
    <div className="animate-fade-in card card-comfortable" style={{ maxWidth: '600px', margin: '40px auto', display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={36} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)' }}>Shift Closed Successfully</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>The Shift Summary is saved permanently.</p>
      </div>

      <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', display: 'flex', flexDirection: 'column', fontSize: '13px', overflow: 'hidden', backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignSelf: 'stretch', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Expected Safe Cash</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{inr(result.expectedCash)}</span>
        </div>
        <div style={{ display: 'flex', alignSelf: 'stretch', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Actual Closing Cash Entered</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{inr(result.closingCash)}</span>
        </div>
        <div style={{ display: 'flex', alignSelf: 'stretch', justifyContent: 'space-between', padding: '12px 16px', fontWeight: 700, color: result.variance === 0 ? 'var(--state-success-fg)' : 'var(--brand-danger)' }}>
          <span>Cash Variance</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {result.variance > 0 ? '+' : ''}{inr(result.variance)}
            {result.variance === 0 ? ' (Perfect Match)' : ''}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <Button variant="primary" size="md" leftIcon={<Play size={13} style={{ fill: 'currentColor' }} />} onClick={onStartNext}>
          Start Next Shift
        </Button>
        <Button variant="secondary" size="md" leftIcon={<FileText size={13} />} onClick={onViewSummary}>
          View Compiled Shift Summary
        </Button>
        <Button variant="secondary" size="md" onClick={onBack}>
          Back to Workspace
        </Button>
      </div>
    </div>
  );
};
