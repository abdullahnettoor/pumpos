import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../pump-ds/lib/cn.js';
import { createPortal } from 'react-dom';
import { Calculator } from 'lucide-react';
import { Button } from '../../pump-ds/button/index.js';
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

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        if (initialObserved != null && !observedInput) {
          setObservedInput(String(initialObserved));
        }
        if (initialTempC != null && !tempInput) {
          setTempInput(String(initialTempC));
        }
      }
      return next;
    });
  };

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

  const inputClass =
    'box-border h-7 w-full rounded-input border border-border-strong bg-surface px-2 py-0 text-left font-mono text-[12px] text-ink-strong';

  const panel = pos && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Density calculator"
      className={cn(
        'fixed z-[1100] box-border flex w-74 flex-col gap-2 rounded-card border border-border-strong bg-surface p-3 shadow-(--shadow-popover)',
        pos.placement === 'top' && '-translate-y-full',
      )}
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-ink-muted">
          15 °C Density calculator
        </span>
        <span
          className="rounded-input bg-surface-alt px-1.25 py-0.5 font-mono text-[12px] font-medium text-ink-muted"
          title={
            method === 'OMC_TABLE_53B'
              ? 'OMC Table 53B (with glass correction)'
              : 'ASTM D1250 (Adjunct)'
          }
        >
          {method === 'OMC_TABLE_53B' ? 'OMC 53B' : 'ASTM 54B'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div>
          <label
            htmlFor="density-calc-obs"
            className="mb-0.5 block text-[12px] font-semibold text-ink-strong"
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
            className={inputClass}
            autoFocus
          />
        </div>

        <div>
          <label
            htmlFor="density-calc-temp"
            className="mb-0.5 block text-[12px] font-semibold text-ink-strong"
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
            className={inputClass}
          />
        </div>
      </div>

      {/* Computed result box */}
      <div className="flex flex-col gap-1 rounded-input border border-border-soft bg-surface-alt px-2.5 py-2">
        {roundedRho15 != null && calculatedVcf != null ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-ink-muted">Density at 15 °C:</span>
              <span className="font-mono text-[15px] font-medium text-ink-strong">
                {roundedRho15.toFixed(2)} kg/m³
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-ink-faint">VCF (CTL):</span>
              <span className="font-mono text-[12px] text-ink-muted">
                {calculatedVcf.toFixed(4)}
              </span>
            </div>

            {invoiceDensity != null && deviation != null && (
              <div className="mt-1 flex items-center justify-between border-t border-border-soft pt-1 text-[12px] [border-top-style:dashed]">
                <span className="text-ink-muted">
                  Δ {deviation >= 0 ? '+' : ''}
                  {deviation.toFixed(2)} kg/m³
                </span>
                <span
                  className={cn(
                    'font-semibold',
                    isWithinTol ? 'text-success-fg' : 'text-warning-fg',
                  )}
                >
                  {isWithinTol ? 'Within tolerance' : 'Outside tolerance'} (±{tolerance})
                </span>
              </div>
            )}
          </>
        ) : calculationError ? (
          <div className="text-[12px] text-warning-fg">{calculationError}</div>
        ) : (
          <div className="py-1 text-center text-[12px] text-ink-faint">
            Enter observed hydrometer density & temperature
          </div>
        )}
      </div>

      {hasManualMismatch && (
        <div className="text-[12px] text-warning-fg">
          Field shows {currentValue} — Apply to replace with {roundedRho15?.toFixed(2)}.
        </div>
      )}

      <div className="mt-0.5 flex gap-1.5">
        <Button variant="secondary" size="sm" onClick={clear} className="flex-none">
          Clear
        </Button>
        <Button size="sm" onClick={apply} disabled={roundedRho15 == null} className="flex-1">
          {roundedRho15 != null ? 'Apply ' + roundedRho15.toFixed(1) : 'Apply'}
        </Button>
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
        onClick={toggleOpen}
        className={cn(
          'inline-flex h-8 w-8 flex-none items-center justify-center rounded-input border border-border-strong disabled:cursor-not-allowed disabled:opacity-50',
          open ? 'bg-surface-alt' : 'bg-surface',
          roundedRho15 != null ? 'text-brand' : 'text-ink-muted',
          !disabled && 'cursor-pointer',
        )}
      >
        <Calculator size={15} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(panel, document.body)}
    </>
  );
};

export const DensityCalculatorPopup = DensityCalculatorPopover;
