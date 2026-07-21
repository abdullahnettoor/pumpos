import React, { useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Checkbox } from '../primitives/Toggle.js';
import { CashCountPopover, type CashBreakdown } from '../primitives/CashCountPopover.js';
import { Button } from '../../pump-ds/index.js';
import { inr } from '../../utils/format.js';
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

  /** Station-level cash summary (server-authoritative) for the closing drawer. */
  cashSummary?: {
    openingCash: number;
    cashSales: number;
    handoverCash: number;
    merchCashOutsideHandover: number;
    cashCollections: number;
    cashIncome: number;
    drawerExpenses: number;
    drawerSupplierPayments: number;
    expectedDrawer: number;
    merchCashBreakdown: { sellerName: string; amount: number }[];
    attendantVariance: number;
    attendantVariances: { name: string; du: string | null; variance: number }[];
    hasHandovers: boolean;
  } | null;

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
  cashSummary,
  stationTanks,
  dipReadings,
  onDipReadingsChange,
  warnings,
  confirmWarningsChecked,
  onConfirmWarningsChange,
  isClosing,
  onConfirmClose,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [recordDip, setRecordDip] = useState(false);
  const [showVarianceWhy, setShowVarianceWhy] = useState(false);
  // Denomination counts for the counted safe cash (held here so re-opening the
  // popover / navigating steps preserves them). Reset when the drawer closes.
  const [cashBreakdown, setCashBreakdown] = useState<CashBreakdown>({});
  React.useEffect(() => { if (!isOpen) setCashBreakdown({}); }, [isOpen]);

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
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<ChevronLeft size={13} />}
        onClick={step === 1 ? onClose : goBack}
      >
        {step === 1 ? 'Cancel' : 'Back'}
      </Button>

      {step < 4 ? (
        <Button
          variant="primary"
          size="sm"
          rightIcon={<ChevronRight size={13} />}
          onClick={goNext}
        >
          Next
        </Button>
      ) : (
        <Button
          variant={canSubmit ? 'primary' : 'secondary'}
          size="sm"
          leftIcon={<Lock size={13} />}
          onClick={onConfirmClose}
          disabled={!canSubmit}
          loading={isClosing}
        >
          {isClosing ? 'Closing Shift…' : 'Close Shift'}
        </Button>
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
              {cashSummary ? (
                <>
                  <div className="close-wizard-row">
                    <span>Opening Cash Float</span>
                    <span className="font-mono">{inr(cashSummary.openingCash)}</span>
                  </div>
                  <div className="close-wizard-row" style={{ color: 'var(--state-success-fg)' }}>
                    <span>(+) Cash Sales</span>
                    <span className="font-mono">+ {inr(cashSummary.cashSales)}</span>
                  </div>
                  {cashSummary.merchCashOutsideHandover > 0 && (
                    <div className="close-wizard-row" style={{ paddingLeft: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>· incl. non-attendant merchandise cash</span>
                      <span className="font-mono">{inr(cashSummary.merchCashOutsideHandover)}</span>
                    </div>
                  )}
                  {cashSummary.merchCashBreakdown.length > 0 && (
                    <div style={{ paddingLeft: 24, paddingRight: 2 }}>
                      {cashSummary.merchCashBreakdown.map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', padding: '1px 0' }}>
                          <span>– {b.sellerName}</span>
                          <span className="font-mono">{inr(b.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="close-wizard-row" style={{ color: 'var(--state-success-fg)' }}>
                    <span>(+) Cash Collections</span>
                    <span className="font-mono">+ {inr(cashSummary.cashCollections)}</span>
                  </div>
                  {cashSummary.cashIncome > 0 && (
                    <div className="close-wizard-row" style={{ color: 'var(--state-success-fg)' }}>
                      <span>(+) Other Income (cash)</span>
                      <span className="font-mono">+ {inr(cashSummary.cashIncome)}</span>
                    </div>
                  )}
                  <div className="close-wizard-row" style={{ color: 'var(--brand-danger)' }}>
                    <span>(−) Drawer Expenses</span>
                    <span className="font-mono">− {inr(cashSummary.drawerExpenses)}</span>
                  </div>
                  {cashSummary.drawerSupplierPayments > 0 && (
                    <div className="close-wizard-row" style={{ color: 'var(--brand-danger)' }}>
                      <span>(−) Supplier Payments (cash)</span>
                      <span className="font-mono">− {inr(cashSummary.drawerSupplierPayments)}</span>
                    </div>
                  )}
                  <div className="close-wizard-row close-wizard-row--total">
                    <span>Expected Safe Cash</span>
                    <span className="font-mono">{inr(expectedCash)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="close-wizard-row">
                    <span>Opening Cash Float</span>
                    <span className="font-mono">{inr(openingCash)}</span>
                  </div>
                  <div className="close-wizard-row" style={{ color: 'var(--state-success-fg)' }}>
                    <span>(+) Cash Collections</span>
                    <span className="font-mono">+ {inr(cashCollections)}</span>
                  </div>
                  <div className="close-wizard-row" style={{ color: 'var(--brand-danger)' }}>
                    <span>(−) Petty Cash Expenses</span>
                    <span className="font-mono">− {inr(cashExpenses)}</span>
                  </div>
                  <div className="close-wizard-row close-wizard-row--total">
                    <span>Expected Safe Cash</span>
                    <span className="font-mono">{inr(expectedCash)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Attendant accountability variance (declared vs metered-expected),
                summed across all attendants — the true net short/surplus that
                nets out cross-attendant settlements (e.g. a borrowed POS). This
                is separate from the drawer count variance below. */}
            {/* Per-attendant / DU variance (declared − metered-expected), with the
                net total on the right of the header. Separate from the drawer
                count variance below; nets out cross-attendant settlements. */}
            {cashSummary?.hasHandovers && cashSummary.attendantVariances.length > 0 && (
              <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', overflow: 'hidden', marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', backgroundColor: 'var(--bg-surface-alt)' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    Attendant sales variance
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: Math.abs(cashSummary.attendantVariance) < 0.005 ? 'var(--text-muted)' : cashSummary.attendantVariance > 0 ? 'var(--brand-warning)' : 'var(--brand-danger)' }}>
                    {cashSummary.attendantVariance > 0 ? '+' : ''}{inr(cashSummary.attendantVariance)}
                    {Math.abs(cashSummary.attendantVariance) < 0.005 ? ' (balanced)' : cashSummary.attendantVariance > 0 ? ' (surplus)' : ' (short)'}
                  </span>
                </div>
                {cashSummary.attendantVariances.map((v, i) => {
                  const bal = Math.abs(v.variance) < 0.005;
                  const color = bal ? 'var(--text-muted)' : v.variance > 0 ? 'var(--brand-warning)' : 'var(--brand-danger)';
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 12, borderTop: '1px solid var(--border-soft)' }}>
                      <span style={{ color: 'var(--text-strong)' }}>{v.name}{v.du ? ` · ${v.du}` : ''}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color }}>
                        {v.variance > 0 ? '+' : ''}{inr(v.variance)}{bal ? '' : v.variance > 0 ? ' (surplus)' : ' (short)'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <label className="close-wizard-field-label">
              Physical counted safe cash (float + deposited)
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number" min="0"
                value={closingCash || ''}
                onChange={(e) => onClosingCashChange(Number(e.target.value))}
                className="close-wizard-input close-wizard-input--num"
                placeholder="0"
                autoFocus
                style={{ flex: 1 }}
              />
              <CashCountPopover
                breakdown={cashBreakdown}
                onBreakdownChange={setCashBreakdown}
                onApply={(t) => onClosingCashChange(t)}
                currentValue={closingCash}
                title="Count safe cash by denomination"
              />
            </div>

            <div
              className="close-wizard-variance"
              data-state={cashVariance === 0 ? 'match' : cashVariance > 0 ? 'surplus' : 'shortage'}
            >
              Drawer cash variance: {cashVariance > 0 ? '+' : ''}{inr(cashVariance)}
              {cashVariance === 0
                ? ' (Perfect Match)'
                : cashVariance > 0
                  ? ' (Cash Surplus)'
                  : ' (Cash Shortage)'}
            </div>

            {cashVariance !== 0 && (
              <div className="close-wizard-why">
                <button
                  type="button"
                  className="close-wizard-why__toggle"
                  onClick={() => setShowVarianceWhy((v) => !v)}
                  aria-expanded={showVarianceWhy}
                >
                  {showVarianceWhy ? 'Hide' : 'Why might this happen?'}
                </button>
                {showVarianceWhy && (
                  <ul className="close-wizard-why__list">
                    {cashVariance < 0 ? (
                      <>
                        <li>Cash-paid petty expense not yet logged — close this drawer and use <strong>+ Expense</strong> (shortcut <kbd>E</kbd>) on the shift bar.</li>
                        <li>Attendant handed over less cash than declared on the chit. Re-check the handover row in the attendants panel.</li>
                        <li>Cash was used to settle a supplier purchase — record it via <strong>+ Purchase</strong> (shortcut <kbd>P</kbd>).</li>
                      </>
                    ) : (
                      <>
                        <li>Customer collection received in cash but not yet logged — use <strong>+ Collection</strong> (shortcut <kbd>C</kbd>) on the shift bar.</li>
                        <li>Counted safe cash includes the next-shift float that hasn't been removed yet.</li>
                        <li>Cash receipt against a credit chit recorded as Credit instead of Cash — verify the latest collections.</li>
                      </>
                    )}
                    <li>An attendant handover is still pending — check the Handovers panel for missing rows.</li>
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="close-wizard-section">
            <h4 className="close-wizard-section-title">Physical Dip Readings</h4>
            <p className="close-wizard-helper">
              Optional. Enter actual tank stock measured with a dip-stick if you performed an
              on-the-ground count. Otherwise system will use computed expected stock.
            </p>

            <div className="close-wizard-toggle">
              <Checkbox
                label="I recorded physical dip readings this shift"
                checked={recordDip}
                onChange={(e) => {
                  const next = e.target.checked;
                  setRecordDip(next);
                  if (!next) onDipReadingsChange({});
                }}
              />
            </div>

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
                        <strong>{Number(tank.currentVolume).toFixed(1)} {tank.productUnit || 'L'}</strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number" min="0"
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
                <div className="close-wizard-toggle">
                  <Checkbox
                    label="I confirm these readings are correct and wish to proceed anyway."
                    checked={confirmWarningsChecked}
                    onChange={(e) => onConfirmWarningsChange(e.target.checked)}
                  />
                </div>
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
                <span className="font-mono">{inr(expectedCash)}</span>
              </div>
              <div className="close-wizard-row">
                <span>Counted Closing Cash</span>
                <span className="font-mono">{inr(closingCash)}</span>
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
                  {cashVariance > 0 ? '+' : ''}{inr(cashVariance)}
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
              On confirm, the shift status moves to <strong>CLOSED</strong> and a Shift Summary (DSSR) snapshot
              is generated and stored permanently.
            </p>
          </section>
        )}
      </div>
    </Drawer>
  );
};
