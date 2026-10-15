import React, { useId, useMemo, useState } from 'react';
import { Drawer } from '../../Drawer.js';
import { Button, Input, Select } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import { DensityCalculatorPopover } from '../../primitives/DensityCalculatorPopover.js';
import { formatQuantity } from '../../../utils/format.js';
import {
  DEFAULT_DENSITY_METHOD,
  density15FromObserved,
  roundDensity,
  type DensityMethod,
  type RecordDensityReadingPayload,
} from '@pump/shared';

export interface RecordDensityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: RecordDensityReadingPayload) => Promise<void>;
  stationId: string;
  products: Array<{ id: string; name: string; code: string }>;
  tanks?: Array<{ id: string; name: string; productId: string }>;
  nozzles?: Array<{ id: string; name: string; productId: string }>;
  presetProductId?: string;
  defaultMethod?: DensityMethod;
  /**
   * The station's jump tolerance (kg/m³, `resolveDecantationSettings`) for the
   * live delta chip; no default here. Not used by the 15 °C solver.
   */
  tolerance: number;
  defaultEntryMethod?: 'HYDROMETER' | 'DIRECT_15';
}

const LABEL = 'mb-1 block text-[13px] font-medium text-ink';
const LABEL_SM = 'mb-1 block text-[12px] font-medium text-ink';

export const RecordDensityDrawer: React.FC<RecordDensityDrawerProps> = ({
  isOpen,
  onClose,
  onSave,
  stationId,
  products,
  tanks = [],
  nozzles = [],
  presetProductId,
  defaultMethod = DEFAULT_DENSITY_METHOD,
  tolerance,
  defaultEntryMethod = 'HYDROMETER',
}) => {
  const [productId, setProductId] = useState<string>(presetProductId || products[0]?.id || '');
  const [kind, setKind] = useState<'MORNING' | 'ADHOC'>('MORNING');
  const [entryMethod, setEntryMethod] = useState<'HYDROMETER' | 'DIRECT_15'>(defaultEntryMethod);
  const [sampledFrom, setSampledFrom] = useState<'NONE' | 'TANK' | 'NOZZLE'>('NONE');
  const [tankId, setTankId] = useState<string>('');
  const [nozzleId, setNozzleId] = useState<string>('');

  const [observedDensity, setObservedDensity] = useState<string>('');
  const [observedTempC, setObservedTempC] = useState<string>('');
  const [density15Direct, setDensity15Direct] = useState<string>('');

  const uid = useId();
  const ids = {
    product: `${uid}-product`,
    routine: `${uid}-routine`,
    method: `${uid}-method`,
    observed: `${uid}-observed`,
    temp: `${uid}-temp`,
    direct: `${uid}-direct`,
    sampled: `${uid}-sampled`,
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-derive form defaults when the drawer opens or its preset product changes
  // (adjusting state during render rather than in an effect).
  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [prevPreset, setPrevPreset] = useState(presetProductId);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    // Entry method defaults from Station Settings each time the drawer opens.
    if (isOpen) setEntryMethod(defaultEntryMethod);
  }
  if (presetProductId !== prevPreset) {
    setPrevPreset(presetProductId);
    if (presetProductId) setProductId(presetProductId);
  }
  if (!productId && products.length > 0) setProductId(products[0].id);

  const relevantTanks = useMemo(
    () => tanks.filter((t) => t.productId === productId),
    [tanks, productId],
  );

  const relevantNozzles = useMemo(
    () => nozzles.filter((n) => n.productId === productId),
    [nozzles, productId],
  );

  const calc15 = useMemo(() => {
    if (entryMethod === 'DIRECT_15') {
      const v = parseFloat(density15Direct);
      return !isNaN(v) && v > 0 ? v : null;
    }
    const obs = parseFloat(observedDensity);
    const temp = parseFloat(observedTempC);
    if (!isNaN(obs) && !isNaN(temp) && obs > 0) {
      try {
        return roundDensity(density15FromObserved(obs, temp, { method: defaultMethod }), 2);
      } catch {
        return null;
      }
    }
    return null;
  }, [entryMethod, density15Direct, observedDensity, observedTempC, defaultMethod]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productId) {
      setError('Please select a product');
      return;
    }

    if (entryMethod === 'HYDROMETER') {
      const obs = parseFloat(observedDensity);
      const temp = parseFloat(observedTempC);
      if (isNaN(obs) || obs <= 0) {
        setError('Please enter a valid observed hydrometer density');
        return;
      }
      if (isNaN(temp)) {
        setError('Please enter a valid observed temperature');
        return;
      }
    } else {
      const d15 = parseFloat(density15Direct);
      if (isNaN(d15) || d15 <= 0) {
        setError('Please enter a valid 15 °C density');
        return;
      }
    }

    const payload: RecordDensityReadingPayload = {
      stationId,
      productId,
      kind,
      entryMethod,
      sampledFrom: sampledFrom === 'NONE' ? null : sampledFrom,
      tankId: sampledFrom === 'TANK' && tankId ? tankId : null,
      nozzleId: sampledFrom === 'NOZZLE' && nozzleId ? nozzleId : null,
      observedDensity: entryMethod === 'HYDROMETER' ? parseFloat(observedDensity) : undefined,
      observedTempC: entryMethod === 'HYDROMETER' ? parseFloat(observedTempC) : undefined,
      density15: entryMethod === 'DIRECT_15' ? parseFloat(density15Direct) : undefined,
    };

    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save density reading');
    } finally {
      setSaving(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === productId);
  const hasCalc = calc15 != null;

  /** A choice button: the chosen one is filled. */
  const toggle = (active: boolean): 'primary' | 'secondary' => (active ? 'primary' : 'secondary');

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        selectedProduct
          ? `Record density · ${selectedProduct.name} (${selectedProduct.code})`
          : 'Record product density'
      }
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={saving || calc15 == null}
          >
            {saving ? 'Saving…' : 'Save reading'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        {error && (
          <div
            className="rounded-md bg-danger-bg px-3 py-2 text-[13px] text-danger-fg"
            role="alert"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor={ids.product} className={LABEL}>
            Fuel product
          </label>
          <Select
            id={ids.product}
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setTankId('');
              setNozzleId('');
            }}
            disabled={saving}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </Select>
        </div>

        <div role="group" aria-labelledby={ids.routine}>
          <div id={ids.routine} className={LABEL}>
            Reading routine
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={toggle(kind === 'MORNING')}
              aria-pressed={kind === 'MORNING'}
              onClick={() => setKind('MORNING')}
            >
              Morning routine (daily)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={toggle(kind === 'ADHOC')}
              aria-pressed={kind === 'ADHOC'}
              onClick={() => setKind('ADHOC')}
            >
              Ad-hoc / spot check
            </Button>
          </div>
        </div>

        <div role="group" aria-labelledby={ids.method}>
          <div id={ids.method} className={LABEL}>
            Entry method
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={toggle(entryMethod === 'HYDROMETER')}
              aria-pressed={entryMethod === 'HYDROMETER'}
              onClick={() => setEntryMethod('HYDROMETER')}
            >
              Hydrometer + temperature
            </Button>
            <Button
              type="button"
              size="sm"
              variant={toggle(entryMethod === 'DIRECT_15')}
              aria-pressed={entryMethod === 'DIRECT_15'}
              onClick={() => setEntryMethod('DIRECT_15')}
            >
              Direct 15 °C value
            </Button>
          </div>
        </div>

        {entryMethod === 'HYDROMETER' ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border-soft bg-surface-alt p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={ids.observed} className={LABEL_SM}>
                  Observed hydrometer (kg/m³)
                </label>
                <div className="flex items-center gap-1">
                  <Input
                    id={ids.observed}
                    type="number"
                    step="0.1"
                    placeholder="e.g. 745.0"
                    value={observedDensity}
                    onChange={(e) => setObservedDensity(e.target.value)}
                  />
                  <DensityCalculatorPopover
                    method={defaultMethod}
                    tolerance={tolerance}
                    initialObserved={parseFloat(observedDensity) || undefined}
                    initialTempC={parseFloat(observedTempC) || undefined}
                    onApply={(d15, obs, temp) => {
                      setDensity15Direct(d15.toString());
                      setObservedDensity(obs.toString());
                      setObservedTempC(temp.toString());
                    }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor={ids.temp} className={LABEL_SM}>
                  Observed temperature (°C)
                </label>
                <Input
                  id={ids.temp}
                  type="number"
                  step="0.1"
                  placeholder="e.g. 28.5"
                  value={observedTempC}
                  onChange={(e) => setObservedTempC(e.target.value)}
                />
              </div>
            </div>

            <div
              className={cn(
                'flex items-center justify-between rounded-md border border-border-soft px-3 py-2',
                hasCalc ? 'bg-info-bg' : 'bg-surface',
              )}
            >
              <span className="text-[12px] text-ink-muted">Computed density at 15 °C:</span>
              <strong
                className={cn(
                  'font-mono text-[18px] tabular-nums',
                  hasCalc ? 'text-info-fg' : 'text-ink-faint',
                )}
              >
                {calc15 != null ? formatQuantity(calc15, 'kg/m³', { decimals: 2 }) : '— — —'}
              </strong>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor={ids.direct} className={LABEL}>
              Density at 15 °C (kg/m³)
            </label>
            <Input
              id={ids.direct}
              type="number"
              step="0.1"
              placeholder="e.g. 753.5"
              value={density15Direct}
              onChange={(e) => setDensity15Direct(e.target.value)}
            />
          </div>
        )}

        <div
          role="group"
          aria-labelledby={ids.sampled}
          className="border-t border-border-soft pt-3"
        >
          <div id={ids.sampled} className={cn(LABEL_SM, 'mb-1.5')}>
            Sampled from (optional)
          </div>
          <div className="mb-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={toggle(sampledFrom === 'NONE')}
              aria-pressed={sampledFrom === 'NONE'}
              onClick={() => setSampledFrom('NONE')}
            >
              Unspecified
            </Button>
            <Button
              type="button"
              size="sm"
              variant={toggle(sampledFrom === 'TANK')}
              aria-pressed={sampledFrom === 'TANK'}
              onClick={() => setSampledFrom('TANK')}
              disabled={relevantTanks.length === 0}
            >
              Tank ({relevantTanks.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={toggle(sampledFrom === 'NOZZLE')}
              aria-pressed={sampledFrom === 'NOZZLE'}
              onClick={() => setSampledFrom('NOZZLE')}
              disabled={relevantNozzles.length === 0}
            >
              Nozzle ({relevantNozzles.length})
            </Button>
          </div>

          {sampledFrom === 'TANK' && relevantTanks.length > 0 && (
            <Select
              inputSize="sm"
              aria-label="Sampled tank"
              value={tankId}
              onChange={(e) => setTankId(e.target.value)}
            >
              <option value="">Select tank…</option>
              {relevantTanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}

          {sampledFrom === 'NOZZLE' && relevantNozzles.length > 0 && (
            <Select
              inputSize="sm"
              aria-label="Sampled nozzle"
              value={nozzleId}
              onChange={(e) => setNozzleId(e.target.value)}
            >
              <option value="">Select nozzle…</option>
              {relevantNozzles.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </form>
    </Drawer>
  );
};
