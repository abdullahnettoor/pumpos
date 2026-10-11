import React, { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  density15FromForm,
  recordDensityFormSchema,
  toRecordDensityPayload,
  type DensityMethod,
  type RecordDensityFormValues,
  type RecordDensityReadingPayload,
} from '@pump/shared';
import { NumberField, SelectField } from '../../components/handover/Fields.js';
import { BottomSheet } from '../../ui/index.js';

type Named = { id: string; name: string; productId: string };

export interface RecordDensitySheetProps {
  open: boolean;
  onClose: () => void;
  stationId: string;
  products: readonly { id: string; name: string; code: string }[];
  tanks: readonly Named[];
  nozzles: readonly Named[];
  /** Product preselected when the sheet opens. */
  presetProductId: string;
  defaultEntryMethod: 'HYDROMETER' | 'DIRECT_15';
  method: DensityMethod;
  tolerance: number;
  /** Last 15 °C density per product, for the jump warning. */
  lastDensityFor: (productId: string) => number | null;
  saving: boolean;
  onSave: (payload: RecordDensityReadingPayload) => Promise<void>;
}

const emptyValues = (
  productId: string,
  entryMethod: 'HYDROMETER' | 'DIRECT_15',
): RecordDensityFormValues => ({
  productId,
  kind: 'MORNING',
  entryMethod,
  sampledFrom: 'NONE',
  tankId: '',
  nozzleId: '',
  observedDensity: '',
  observedTempC: '',
  density15Direct: '',
});

/** The Record density bottom sheet: React Hook Form + the shared Zod schema. */
export const RecordDensitySheet: React.FC<RecordDensitySheetProps> = (props) => (
  <BottomSheet open={props.open} onClose={props.onClose} label="Record density">
    {/* Mounted per opening, so each opening starts from fresh defaults. */}
    {props.open && <RecordDensityForm {...props} />}
  </BottomSheet>
);

const RecordDensityForm: React.FC<RecordDensitySheetProps> = (props) => {
  const { onClose, stationId, products, tanks, nozzles, method, tolerance } = props;
  const { setValue, control, handleSubmit } = useForm<RecordDensityFormValues>({
    resolver: zodResolver(recordDensityFormSchema),
    defaultValues: emptyValues(props.presetProductId, props.defaultEntryMethod),
  });
  const [error, setError] = useState<string | null>(null);
  const v = useWatch({ control }) as RecordDensityFormValues;

  const productTanks = useMemo(
    () => tanks.filter((t) => t.productId === v.productId),
    [tanks, v.productId],
  );
  const productNozzles = useMemo(
    () => nozzles.filter((n) => n.productId === v.productId),
    [nozzles, v.productId],
  );
  const density15 = density15FromForm(v, method);
  const last = props.lastDensityFor(v.productId);
  const set = (key: keyof RecordDensityFormValues, value: string) =>
    setValue(key, value as never, { shouldDirty: true });

  const submit = handleSubmit(async (values) => {
    if (density15 == null) return;
    try {
      await props.onSave(toRecordDensityPayload(stationId, values, density15));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this density reading.');
    }
  });

  return (
    <>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-text-high">Record density</h2>
            <p className="text-xs text-text-muted">
              The reading is saved against today&apos;s Business Day.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hit-44 -mr-2 -mt-2 text-xl text-text-muted"
          >
            ×
          </button>
        </div>
        <SelectField
          label="Fuel product"
          value={v.productId}
          onChange={(value) => {
            set('productId', value);
            set('tankId', '');
            set('nozzleId', '');
          }}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} ({product.code})
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceButton selected={v.kind === 'MORNING'} onClick={() => set('kind', 'MORNING')}>
            Morning
          </ChoiceButton>
          <ChoiceButton selected={v.kind === 'ADHOC'} onClick={() => set('kind', 'ADHOC')}>
            Ad-hoc
          </ChoiceButton>
        </div>
        <SelectField
          label="Entry method"
          value={v.entryMethod}
          onChange={(value) => set('entryMethod', value)}
        >
          <option value="HYDROMETER">Hydrometer + temperature</option>
          <option value="DIRECT_15">Direct 15 °C value</option>
        </SelectField>
        {v.entryMethod === 'HYDROMETER' ? (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-card-alt p-3">
            <NumberField
              label="Observed hydrometer (kg/m³)"
              value={v.observedDensity}
              onChange={(value) => set('observedDensity', value)}
              min={600}
              step={0.01}
            />
            <NumberField
              label="Observed temperature (°C)"
              value={v.observedTempC}
              onChange={(value) => set('observedTempC', value)}
              step={0.01}
            />
            <p className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-xs text-text-muted">
              Density at 15 °C{' '}
              <strong className="num text-sm text-text-high">
                {density15 == null ? '—' : `${density15.toFixed(2)} kg/m³`}
              </strong>
            </p>
          </div>
        ) : (
          <NumberField
            label="Density at 15 °C (kg/m³)"
            value={v.density15Direct}
            onChange={(value) => set('density15Direct', value)}
            min={600}
            step={0.01}
          />
        )}
        <SelectField
          label="Sampled from"
          value={v.sampledFrom}
          onChange={(value) => {
            set('sampledFrom', value);
            set('tankId', '');
            set('nozzleId', '');
          }}
        >
          <option value="NONE">Unspecified</option>
          {productNozzles.length > 0 && <option value="NOZZLE">Nozzle</option>}
          {productTanks.length > 0 && <option value="TANK">Tank</option>}
        </SelectField>
        {v.sampledFrom === 'TANK' && (
          <SelectField label="Tank" value={v.tankId} onChange={(value) => set('tankId', value)}>
            <option value="">Select tank…</option>
            {productTanks.map((tank) => (
              <option key={tank.id} value={tank.id}>
                {tank.name}
              </option>
            ))}
          </SelectField>
        )}
        {v.sampledFrom === 'NOZZLE' && (
          <SelectField
            label="Nozzle"
            value={v.nozzleId}
            onChange={(value) => set('nozzleId', value)}
          >
            <option value="">Select nozzle…</option>
            {productNozzles.map((nozzle) => (
              <option key={nozzle.id} value={nozzle.id}>
                {nozzle.name}
              </option>
            ))}
          </SelectField>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-bad-line bg-bad-soft p-2.5 text-sm text-bad-fg"
          >
            {error}
          </p>
        )}
        {density15 != null && last != null && Math.abs(density15 - last) > tolerance && (
          <p className="rounded-lg border border-warn-line bg-warn-soft p-2.5 text-xs text-warn-fg">
            This differs by {Math.abs(density15 - last).toFixed(2)} kg/m³ from the last reading. It
            will be saved and flagged if no Decantation explains the change.
          </p>
        )}
        <button
          type="submit"
          disabled={density15 == null || !v.productId || props.saving}
          className="hit-44 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-50"
        >
          {props.saving ? 'Saving…' : 'Save reading'}
        </button>
      </form>
    </>
  );
};

const ChoiceButton: React.FC<{
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ selected, onClick, children }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`hit-44 rounded-xl border text-[13px] font-semibold ${selected ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-text-muted'}`}
  >
    {children}
  </button>
);
