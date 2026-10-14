import React, { useId, useMemo, useState } from 'react';
import { Drawer } from '../../Drawer.js';
import { Button, Icon } from '../../../pump-ds/index.js';
import { DensityCalculatorPopover } from '../../primitives/DensityCalculatorPopover.js';
import {
  DEFAULT_DENSITY_METHOD,
  DEFAULT_DENSITY_TOLERANCE_KG_M3,
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
  /** Jump tolerance (kg/m³) for the live delta chip; not used by the 15 °C solver. */
  tolerance?: number;
  defaultEntryMethod?: 'HYDROMETER' | 'DIRECT_15';
}

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
  tolerance = DEFAULT_DENSITY_TOLERANCE_KG_M3,
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

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        selectedProduct
          ? `Record Density · ${selectedProduct.name} (${selectedProduct.code})`
          : 'Record Product Density'
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={saving || calc15 == null}
          >
            {saving ? 'Saving...' : 'Save Reading'}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {error && (
          <div
            className="rounded-md bg-danger-bg px-3 py-2 text-[13px] text-danger-fg"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Product selection */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Fuel Product
          </label>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setTankId('');
              setNozzleId('');
            }}
            className="input"
            style={{ width: '100%', height: 34, fontSize: 13 }}
            disabled={saving}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        {/* Reading Kind */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Reading Routine
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              size="sm"
              variant={kind === 'MORNING' ? 'primary' : 'secondary'}
              onClick={() => setKind('MORNING')}
            >
              Morning Routine (Daily)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === 'ADHOC' ? 'primary' : 'secondary'}
              onClick={() => setKind('ADHOC')}
            >
              Ad-hoc / Spot Check
            </Button>
          </div>
        </div>

        {/* Entry Method */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Entry Method
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              size="sm"
              variant={entryMethod === 'HYDROMETER' ? 'primary' : 'secondary'}
              onClick={() => setEntryMethod('HYDROMETER')}
            >
              Hydrometer + Temperature
            </Button>
            <Button
              type="button"
              size="sm"
              variant={entryMethod === 'DIRECT_15' ? 'primary' : 'secondary'}
              onClick={() => setEntryMethod('DIRECT_15')}
            >
              Direct 15 °C Value
            </Button>
          </div>
        </div>

        {/* Hydrometer Entry Fields */}
        {entryMethod === 'HYDROMETER' ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border-soft bg-surface-alt p-3">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Observed Hydrometer (kg/m³)
                </label>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 745.0"
                    value={observedDensity}
                    onChange={(e) => setObservedDensity(e.target.value)}
                    className="input"
                    style={{ width: '100%', height: 34, fontSize: 13 }}
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
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Observed Temperature (°C)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 28.5"
                  value={observedTempC}
                  onChange={(e) => setObservedTempC(e.target.value)}
                  className="input"
                  style={{ width: '100%', height: 34, fontSize: 13 }}
                />
              </div>
            </div>

            {/* Computed 15 °C banner */}
            <div
              className={`flex items-center justify-between rounded-md border border-border-soft px-3 py-2 ${
                calc15 ? 'bg-info-bg' : 'bg-surface'
              }`}
            >
              <span className="text-[12px] text-ink-muted">Computed density at 15 °C:</span>
              <strong
                className={`font-mono text-[18px] tabular-nums ${
                  calc15 ? 'text-info-fg' : 'text-ink-faint'
                }`}
              >
                {calc15 != null ? `${calc15.toFixed(2)} kg/m³` : '— — —'}
              </strong>
            </div>
          </div>
        ) : (
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              Density at 15 °C (kg/m³)
            </label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 753.5"
              value={density15Direct}
              onChange={(e) => setDensity15Direct(e.target.value)}
              className="input"
              style={{ width: '100%', height: 34, fontSize: 13 }}
            />
          </div>
        )}

        {/* Optional sampled from */}
        <div className="border-t border-border-soft pt-3">
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
            Sampled From (Optional)
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Button
              type="button"
              size="sm"
              variant={sampledFrom === 'NONE' ? 'primary' : 'secondary'}
              onClick={() => setSampledFrom('NONE')}
            >
              Unspecified
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sampledFrom === 'TANK' ? 'primary' : 'secondary'}
              onClick={() => setSampledFrom('TANK')}
              disabled={relevantTanks.length === 0}
            >
              Tank ({relevantTanks.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sampledFrom === 'NOZZLE' ? 'primary' : 'secondary'}
              onClick={() => setSampledFrom('NOZZLE')}
              disabled={relevantNozzles.length === 0}
            >
              Nozzle ({relevantNozzles.length})
            </Button>
          </div>

          {sampledFrom === 'TANK' && relevantTanks.length > 0 && (
            <select
              value={tankId}
              onChange={(e) => setTankId(e.target.value)}
              className="input"
              style={{ width: '100%', height: 32, fontSize: 12 }}
            >
              <option value="">Select tank...</option>
              {relevantTanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {sampledFrom === 'NOZZLE' && relevantNozzles.length > 0 && (
            <select
              value={nozzleId}
              onChange={(e) => setNozzleId(e.target.value)}
              className="input"
              style={{ width: '100%', height: 32, fontSize: 12 }}
            >
              <option value="">Select nozzle...</option>
              {relevantNozzles.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </form>
    </Drawer>
  );
};
