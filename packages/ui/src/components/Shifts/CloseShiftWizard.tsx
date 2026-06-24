import React, { useState } from 'react';
import { Drawer } from '../Drawer.js';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Lock, Wallet, Droplet, FileText } from 'lucide-react';

export interface CloseShiftWizardProps {
  isOpen: boolean;
  onClose: () => void;

  // Identity
  shiftTemplateName: string;
  openedAt: string;

  // Cash reconciliation inputs
  openingCash: number;
  cashCollections: number;
  cashExpenses: number;
  expectedCash: number;
  closingCash: number;
  onClosingCashChange: (val: number) => void;

  // Physical dip
  stationTanks: any[];
  dipReadings: Record<string, number | string>;
  onDipReadingsChange: (next: Record<string, number | string>) => void;

  // Warnings
  warnings: string[];
  confirmWarningsChecked: boolean;
  onConfirmWarningsChange: (val: boolean) => void;

  // Submission
  isClosing: boolean;
  onConfirmClose: () => void;
  onConfirmCloseAndStartNext: () => void;
}

type Step = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<Step, string> = {
  1: 'Cash Reconciliation',
  2: 'Physical Dip Readings',
  3: 'Review Warnings',
  4: 'Confirm & Compile DSSR',
};

const STEP_ICONS: Record<Step, React.ReactNode> = {
  1: <Wallet size={13} />,
  2: <Droplet size={13} />,
  3: <AlertTriangle size={13} />,
  4: <FileText size={13} />,
};

export const CloseShiftWizard: React.FC<CloseShiftWizardProps> = ({
  isOpen,
  onClose,
  shiftTemplateName,
  openedAt,
  openingCash,
  cashCollections,
  cashExpenses,
  expectedCash,
  closingCash,
  onClosingCashChange,
  stationTanks,
  dipReadings,
  onDipReadingsChange,
  warnings,
  confirmWarningsChecked,
  onConfirmWarningsChange,
  isClosing,
  onConfirmClose,
  onConfirmCloseAndStartNext,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [recordDip, setRecordDip] = useState(false);

  const cashVariance = closingCash - expectedCash;
  const hasWarnings = warnings.length > 0;
  const canSubmit = !hasWarnings || confirmWarningsChecked;

  const goNext = () => setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  // Reset to step 1 when drawer is freshly opened
  React.useEffect(() => {
    if (isOpen && step !== 1 && !confirmWarningsChecked && closingCash === 0) {
      // Drawer reopened from scratch — keep current step (preserve progress)
    }
  }, [isOpen]);

  const stepper = (
    <div className="close-wizard-stepper">
      {([1, 2, 3, 4] as Step[]).map((s) => {
        const isActive = s === step;
        const isDone = s < step;
        return (
          <div key={s} className="close-wizard-step-pill" data-state={isActive ? 'active' : isDone ? 'done' : 'pending'}>
            <span className="close-wizard-step-num">{isDone ? <Check size={11} /> : s}</span>
            <span className="close-wizard-step-label">
              {STEP_ICONS[s]} {STEP_TITLES[s]}
            </span>
          </div>
        );
      })}
    </div>
  );

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', width: '100%' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={step === 1 ? onClose : goBack}
      >
        <ChevronLeft size={13} /> {step === 1 ? 'Cancel' : 'Back'}
      </button>

      {step < 4 ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={goNext}
        >
          Next <ChevronRight size={13} />
        </button>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onConfirmCloseAndStartNext}
            disabled={!canSubmit || isClosing}
          >
            Close &amp; Start Next
          </button>
          <button
            type="button"
            className={canSubmit ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={onConfirmClose}
            disabled={!canSubmit || isClosing}
          >
            <Lock size={13} /> {isClosing ? 'Closing Shift…' : 'Close Shift'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Close Shift · ${shiftTemplateName}`}
      widthVariant="wide"
      footer={footer}
    >
      <div className="close-wizard-body">
        <div className="close-wizard-meta">
          Opened {new Date(openedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · Step {step} of 4
        </div>
        {stepper}

        {step === 1 && (
          <section className="close-wizard-section">
            <h4 className="close-wizard-section-title">Cash Reconciliation</h4>

            <div className="close-wizard-summary-card">
              <div className="close-wizard-row">
                <span>Opening Cash Float</span>
                <span className="font-mono">₹{openingCash.toLocaleString('en-IN')}</span>
              </div>
              <div className="close-wizard-row" style={{ color: 'var(--state-success-fg)' }}>
                <span>(+) Cash Collections</span>
                <span className="font-mono">+ ₹{cashCollections.toLocaleString('en-IN')}</span>
              </div>
              <div className="close-wizard-row" style={{ color: 'var(--brand-danger)' }}>
                <span>(−) Petty Cash Expenses</span>
                <span className="font-mono">− ₹{cashExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div className="close-wizard-row close-wizard-row--total">
                <span>Expected Safe Cash</span>
                <span className="font-mono">₹{expectedCash.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <label className="close-wizard-field-label">
              Physical counted safe cash (float + deposited)
            </label>
            <input
              type="number"
              value={closingCash}
              onChange={(e) => onClosingCashChange(Number(e.target.value))}
              className="close-wizard-input close-wizard-input--num"
              placeholder="0"
              autoFocus
            />

            <div
              className="close-wizard-variance"
              data-state={cashVariance === 0 ? 'match' : cashVariance > 0 ? 'surplus' : 'shortage'}
            >
              Variance: {cashVariance > 0 ? '+' : ''}₹{cashVariance.toLocaleString('en-IN')}
              {cashVariance === 0
                ? ' (Perfect Match)'
                : cashVariance > 0
                  ? ' (Cash Surplus)'
                  : ' (Cash Shortage)'}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="close-wizard-section">
            <h4 className="close-wizard-section-title">Physical Dip Readings</h4>
            <p className="close-wizard-helper">
              Optional. Enter actual tank stock measured with a dip-stick if you performed an
              on-the-ground count. Otherwise system will use computed expected stock.
            </p>

            <label className="close-wizard-toggle">
              <input
                type="checkbox"
                checked={recordDip}
                onChange={(e) => {
                  const next = e.target.checked;
                  setRecordDip(next);
                  if (!next) onDipReadingsChange({});
                }}
              />
              <span>I recorded physical dip readings this shift</span>
            </label>

            {recordDip && stationTanks.length === 0 && (
              <div className="close-wizard-helper" style={{ marginTop: '8px' }}>
                No tanks configured for this station.
              </div>
            )}

            {recordDip && stationTanks.length > 0 && (
              <div className="close-wizard-tank-list">
                {stationTanks.map((tank) => (
                  <div key={tank.id} className="close-wizard-tank-row">
                    <div>
                      <div className="close-wizard-tank-name">{tank.name}</div>
                      <div className="close-wizard-tank-meta">
                        {tank.productName} · Expected{' '}
                        <strong>{Number(tank.currentVolume).toFixed(1)} L</strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Actual"
                        value={dipReadings[tank.id] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          onDipReadingsChange({
                            ...dipReadings,
                            [tank.id]: val === '' ? '' : Number(val),
                          });
                        }}
                        className="close-wizard-input close-wizard-input--small"
                      />
                      <span className="close-wizard-helper">L</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="close-wizard-section">
            <h4 className="close-wizard-section-title">Review Warnings</h4>
            {!hasWarnings && (
              <div className="close-wizard-banner close-wizard-banner--success">
                <Check size={14} /> No warnings detected. Safe to proceed.
              </div>
            )}
            {hasWarnings && (
              <>
                <div className="close-wizard-banner close-wizard-banner--warning">
                  <AlertTriangle size={14} /> {warnings.length} warning{warnings.length === 1 ? '' : 's'} require acknowledgement.
                </div>
                <ul className="close-wizard-warning-list">
                  {warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
                <label className="close-wizard-toggle">
                  <input
                    type="checkbox"
                    checked={confirmWarningsChecked}
                    onChange={(e) => onConfirmWarningsChange(e.target.checked)}
                  />
                  <span>I confirm these readings are correct and wish to proceed anyway.</span>
                </label>
              </>
            )}
          </section>
        )}

        {step === 4 && (
          <section className="close-wizard-section">
            <h4 className="close-wizard-section-title">Confirm &amp; Compile DSSR</h4>
            <div className="close-wizard-summary-card">
              <div className="close-wizard-row">
                <span>Expected Safe Cash</span>
                <span className="font-mono">₹{expectedCash.toLocaleString('en-IN')}</span>
              </div>
              <div className="close-wizard-row">
                <span>Counted Closing Cash</span>
                <span className="font-mono">₹{closingCash.toLocaleString('en-IN')}</span>
              </div>
              <div
                className="close-wizard-row close-wizard-row--total"
                style={{
                  color:
                    cashVariance === 0 ? 'var(--state-success-fg)' : 'var(--brand-danger)',
                }}
              >
                <span>Cash Variance</span>
                <span className="font-mono">
                  {cashVariance > 0 ? '+' : ''}₹{cashVariance.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="close-wizard-row">
                <span>Dip Readings Captured</span>
                <span>{Object.keys(dipReadings).filter((k) => dipReadings[k] !== '' && dipReadings[k] !== undefined).length}</span>
              </div>
              <div className="close-wizard-row">
                <span>Warnings Acknowledged</span>
                <span>
                  {hasWarnings ? (confirmWarningsChecked ? 'Yes' : 'Pending') : 'None'}
                </span>
              </div>
            </div>
            <p className="close-wizard-helper" style={{ marginTop: '8px' }}>
              On confirm, the shift status moves to <strong>CLOSED</strong> and a DSSR snapshot
              is compiled and stored permanently.
            </p>
          </section>
        )}
      </div>
    </Drawer>
  );
};
