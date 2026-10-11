import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator } from 'lucide-react';
import {
  DEFAULT_DENSITY_METHOD,
  DEFAULT_DENSITY_TOLERANCE_KG_M3,
  density15FromObserved,
  densityDeviation,
  densityWithinTolerance,
  roundDensity,
  vcf,
  type DensityMethod,
} from '@pump/shared';

export interface DensityCalculatorPopoverProps {
  /**
   * Calculation method:
   * - 'API_MPMS_11_1_ADJUNCT' (ASTM D1250 / Adjunct, default)
   * - 'OMC_TABLE_53B' (with soda-lime glass hydrometer thermal expansion correction)
   */
  method?: DensityMethod;

  /**
   * Called when applying the calculated 15 °C density into the target field.
   * Signature: (density15, observed, tempC) => void
   */
  onApply: (density15: number, observed: number, tempC: number) => void;

  /** Initial or pre-filled observed density in kg/m³ */
  initialObserved?: number;

  /** Initial or pre-filled observed temperature in °C */
  initialTempC?: number;

  /** Current value in the linked field, used to flag manual mismatches */
  currentValue?: number;

  /** Optional invoice standard density at 15 °C for live tolerance comparison */
  invoiceDensity?: number;

  /** Tolerance limit in kg/m³ (defaults to 3 kg/m³) */
  tolerance?: number;

  /** Whether the trigger is disabled */
  disabled?: boolean;

  /** Accessible label + tooltip for trigger button */
  title?: string;
}

const PANEL_W = 296;

/**
 * A compact popover that computes standard density at 15 °C live from observed
 * hydrometer density and temperature using ASTM D1250 / OMC Table 53B algorithms.
 *
 * Renders in a fixed portal so it never clips inside scrollable drawers or tables.
 */
export const DensityCalculatorPopover: React.FC<DensityCalculatorPopoverProps> = ({
  method = DEFAULT_DENSITY_METHOD,
  onApply,
  initialObserved,
  initialTempC,
  currentValue,
  invoiceDensity,
  tolerance = DEFAULT_DENSITY_TOLERANCE_KG_M3,
  disabled = false,
  title = 'Calculate density at 15 °C',
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [observedInput, setObservedInput] = useState<string>(
    initialObserved != null ? String(initialObserved) : '',
  );
  const [tempInput, setTempInput] = useState<string>(
    initialTempC != null ? String(initialTempC) : '',
  );

  // Synchronize inputs when popover opens or initial values change
  useEffect(() => {
    if (open) {
      if (initialObserved != null && !observedInput) {
        setObservedInput(String(initialObserved));
      }
      if (initialTempC != null && !tempInput) {
        setTempInput(String(initialTempC));
      }
    }
  }, [open, initialObserved, initialTempC]);

  const observedNum = parseFloat(observedInput);
  const tempNum = parseFloat(tempInput);

  let calculatedRho15: number | null = null;
  let calculatedVcf: number | null = null;
  let calculationError: string | null = null;

  if (Number.isFinite(observedNum) && Number.isFinite(tempNum)) {
    try {
      calculatedRho15 = density15FromObserved(observedNum, tempNum, method);
      calculatedVcf = vcf(calculatedRho15, tempNum);
    } catch (err: unknown) {
      calculationError = err instanceof Error ? err.message : 'Invalid parameters';
    }
  }

  const roundedRho15 = calculatedRho15 != null ? roundDensity(calculatedRho15, 2) : null;
  const isWithinTol =
    roundedRho15 != null && invoiceDensity != null
      ? densityWithinTolerance(roundedRho15, invoiceDensity, tolerance)
      : null;
  const deviation =
    roundedRho15 != null && invoiceDensity != null
      ? densityDeviation(roundedRho15, invoiceDensity)
      : null;

  const hasManualMismatch =
    currentValue != null && roundedRho15 != null && Math.abs(currentValue - roundedRho15) > 0.05;

  const compute = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const placement: 'top' | 'bottom' = spaceBelow < 360 && r.top > 360 ? 'top' : 'bottom';
    const left = Math.max(8, Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 8));
    const top = placement === 'bottom' ? r.bottom + 6 : r.top - 6;
    setPos({ top, left, placement });
  };

  useLayoutEffect(() => {
    if (open) compute();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => compute();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const apply = () => {
    if (roundedRho15 == null || !Number.isFinite(observedNum) || !Number.isFinite(tempNum)) return;
    onApply(roundedRho15, observedNum, tempNum);
    setOpen(false);
  };

  const clear = () => {
    setObservedInput('');
    setTempInput('');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '28px',
    padding: '0 8px',
    textAlign: 'left',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-input)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    background: 'var(--bg-surface)',
    color: 'var(--text-strong)',
    boxSizing: 'border-box',
  };

  const panel = pos && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Density Calculator"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: PANEL_W,
        transform: pos.placement === 'top' ? 'translateY(-100%)' : undefined,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-card)',
        boxShadow: '0 8px 24px rgba(24,32,26,0.16)',
        zIndex: 1100,
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-muted)',
          }}
        >
          15 °C Density Calculator
        </span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '2px 5px',
            borderRadius: '4px',
            background: 'var(--bg-surface-alt, #f0f2f0)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
          title={
            method === 'OMC_TABLE_53B'
              ? 'OMC Table 53B (with glass correction)'
              : 'ASTM D1250 (Adjunct)'
          }
        >
          {method === 'OMC_TABLE_53B' ? 'OMC 53B' : 'ASTM 54B'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div>
          <label
            htmlFor="density-calc-obs"
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-strong)',
              marginBottom: '2px',
            }}
          >
            Observed density (kg/m³)
          </label>
          <input
            id="density-calc-obs"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="e.g. 828.0"
            value={observedInput}
            onChange={(e) => setObservedInput(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </div>

        <div>
          <label
            htmlFor="density-calc-temp"
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-strong)',
              marginBottom: '2px',
            }}
          >
            Temperature (°C)
          </label>
          <input
            id="density-calc-temp"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="e.g. 32.0"
            value={tempInput}
            onChange={(e) => setTempInput(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Computed result box */}
      <div
        style={{
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--border-soft)',
          background: 'var(--bg-surface-alt, #f7f9f7)',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {roundedRho15 != null && calculatedVcf != null ? (
          <>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Density at 15 °C:
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                }}
              >
                {roundedRho15.toFixed(2)} kg/m³
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>VCF (CTL):</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                {calculatedVcf.toFixed(4)}
              </span>
            </div>

            {invoiceDensity != null && deviation != null && (
              <div
                style={{
                  marginTop: '4px',
                  paddingTop: '4px',
                  borderTop: '1px dashed var(--border-soft)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '10px',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>
                  Δ {deviation >= 0 ? '+' : ''}
                  {deviation.toFixed(2)} kg/m³
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: isWithinTol
                      ? 'var(--state-success-fg, #15803d)'
                      : 'var(--state-warning-fg, #b45309)',
                  }}
                >
                  {isWithinTol ? 'Within tolerance' : 'Outside tolerance'} (±{tolerance})
                </span>
              </div>
            )}
          </>
        ) : calculationError ? (
          <div style={{ fontSize: '11px', color: 'var(--state-warning-fg, #b45309)' }}>
            {calculationError}
          </div>
        ) : (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-faint)',
              textAlign: 'center',
              padding: '4px 0',
            }}
          >
            Enter observed hydrometer density & temperature
          </div>
        )}
      </div>

      {hasManualMismatch && (
        <div style={{ fontSize: '10px', color: 'var(--state-warning-fg, #b45309)' }}>
          Field shows {currentValue} — Apply to replace with {roundedRho15?.toFixed(2)}.
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        <button
          type="button"
          onClick={clear}
          className="btn btn-secondary btn-sm"
          style={{ flex: '0 0 auto' }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={roundedRho15 == null}
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
        >
          {roundedRho15 != null ? 'Apply ' + roundedRho15.toFixed(1) : 'Apply'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={title}
        title={title}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '32px',
          width: '32px',
          flex: '0 0 auto',
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--border-strong)',
          background: open ? 'var(--bg-surface-alt)' : 'var(--bg-surface)',
          color: roundedRho15 != null ? 'var(--brand-primary)' : 'var(--text-muted)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Calculator size={15} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(panel, document.body)}
    </>
  );
};

export const DensityCalculatorPopup = DensityCalculatorPopover;
