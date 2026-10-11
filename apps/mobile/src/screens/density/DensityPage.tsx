import React, { useMemo, useState } from 'react';
import {
  density15FromObserved,
  resolveDecantationSettings,
  roundDensity,
  type DensityReadingWithContext,
  type DensityTodayProductSummary,
  type RecordDensityReadingPayload,
} from '@pump/shared';
import {
  createIdempotencyKey,
  useDensityReadings,
  useDensityTodaySummary,
  useNozzles,
  useProducts,
  useRecordDensityReading,
  useTanks,
} from '@pump/ui';
import { NumberField, SelectField } from '../../components/handover/Fields.js';
import { useShell } from '../../shell/context.js';
import { BottomSheet, DetailPage, SegmentedControl } from '../../ui/index.js';
import { StatusBadge } from '../../ui/StatusBadge.js';

type DensityTab = 'today' | 'register';
type EntryMethod = 'HYDROMETER' | 'DIRECT_15';
type ReadingKind = 'MORNING' | 'ADHOC';
type SampledFrom = 'NONE' | 'NOZZLE' | 'TANK';

const number = (value: string) => (value.trim() === '' ? null : Number(value));
const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const DensityPage: React.FC = () => {
  const { station } = useShell();
  const stationId = station?.id;
  const settings = useMemo(
    () => resolveDecantationSettings(station?.settings),
    [station?.settings],
  );
  const [tab, setTab] = useState<DensityTab>('today');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [kind, setKind] = useState<ReadingKind>('MORNING');
  const [entryMethod, setEntryMethod] = useState<EntryMethod>(settings.densityEntryMethod);
  const [sampledFrom, setSampledFrom] = useState<SampledFrom>('NONE');
  const [tankId, setTankId] = useState('');
  const [nozzleId, setNozzleId] = useState('');
  const [observedDensity, setObservedDensity] = useState('');
  const [observedTempC, setObservedTempC] = useState('');
  const [density15Direct, setDensity15Direct] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previousDensity, setPreviousDensity] = useState<number | null>(null);

  const todayQ = useDensityTodaySummary(stationId);
  const readingsQ = useDensityReadings(stationId, { productId: productFilter || undefined });
  const productsQ = useProducts();
  const tanksQ = useTanks(stationId);
  const nozzlesQ = useNozzles(stationId);
  const record = useRecordDensityReading(stationId);

  const products = useMemo(
    () =>
      (productsQ.data ?? []).filter(
        (product) => product.productType === 'FUEL' && product.isActive,
      ),
    [productsQ.data],
  );
  const tanks = useMemo(
    () => (tanksQ.data ?? []).filter((tank) => tank.productId === productId),
    [productId, tanksQ.data],
  );
  const nozzles = useMemo(
    () => (nozzlesQ.data ?? []).filter((nozzle) => nozzle.productId === productId),
    [nozzlesQ.data, productId],
  );
  const today = todayQ.data;

  const previousQ = useDensityReadings(
    stationId,
    { productId, limit: 1 },
    {
      enabled: sheetOpen && !!productId,
    },
  );
  const lastDensity = (sheetOpen ? previousQ.data?.[0]?.density15 : null) ?? previousDensity;

  const density15 = useMemo(() => {
    if (entryMethod === 'DIRECT_15') {
      const direct = number(density15Direct);
      return direct != null && Number.isFinite(direct) && direct >= 600 && direct <= 1150
        ? roundDensity(direct, 2)
        : null;
    }
    const observed = number(observedDensity);
    const temperature = number(observedTempC);
    if (
      observed == null ||
      temperature == null ||
      !Number.isFinite(observed) ||
      !Number.isFinite(temperature)
    )
      return null;
    try {
      return roundDensity(
        density15FromObserved(observed, temperature, { method: settings.densityMethod }),
        2,
      );
    } catch {
      return null;
    }
  }, [density15Direct, entryMethod, observedDensity, observedTempC, settings.densityMethod]);

  const openSheet = (presetProductId?: string) => {
    const nextProductId = presetProductId ?? products[0]?.id ?? '';
    setProductId(nextProductId);
    setPreviousDensity(
      today?.products.find((product) => product.productId === nextProductId)?.lastReadings[0]
        ?.density15 ?? null,
    );
    setEntryMethod(settings.densityEntryMethod);
    setKind('MORNING');
    setSampledFrom('NONE');
    setTankId('');
    setNozzleId('');
    setObservedDensity('');
    setObservedTempC('');
    setDensity15Direct('');
    setError(null);
    setSheetOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stationId || !productId || density15 == null) return;
    const observed = number(observedDensity);
    const temperature = number(observedTempC);
    const payload: RecordDensityReadingPayload = {
      stationId,
      productId,
      kind,
      entryMethod,
      sampledFrom: sampledFrom === 'NONE' ? null : sampledFrom,
      tankId: sampledFrom === 'TANK' ? tankId || null : null,
      nozzleId: sampledFrom === 'NOZZLE' ? nozzleId || null : null,
      ...(entryMethod === 'HYDROMETER'
        ? { observedDensity: observed!, observedTempC: temperature! }
        : { density15 }),
    };
    try {
      await record.mutateAsync({ payload, idempotencyKey: createIdempotencyKey() });
      setSheetOpen(false);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this density reading.');
    }
  };

  return (
    <DetailPage title="Density" subtitle={station?.name}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 px-3 pt-2">
          <SegmentedControl
            label="Density view"
            options={[
              { value: 'today', label: 'Today' },
              { value: 'register', label: 'Register' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <button
            type="button"
            className="hit-44 ml-auto rounded-xl bg-accent px-3 text-[13px] font-bold text-on-accent"
            onClick={() => openSheet()}
          >
            Record density
          </button>
        </div>

        {tab === 'today' ? (
          <>
            {todayQ.isLoading && !today && (
              <p className="px-4 py-8 text-center text-sm text-text-muted">
                Loading density readings…
              </p>
            )}
            {todayQ.isError && !today && (
              <p
                role="alert"
                className="mx-3 rounded-xl border border-bad-line bg-bad-soft p-3 text-sm text-bad-fg"
              >
                Could not load today&apos;s density readings.
              </p>
            )}
            {today && (
              <>
                <p className="px-4 text-xs text-text-muted" aria-live="polite">
                  {today.recordedCount}/{today.totalProducts} products recorded today
                </p>
                {today.products.map((product) => (
                  <TodayProductCard
                    key={product.productId}
                    product={product}
                    band={settings.densitySpecBands[product.productId]}
                    onRecord={() => openSheet(product.productId)}
                  />
                ))}
                {!today.products.length && (
                  <p className="mx-3 rounded-xl border border-line p-4 text-sm text-text-muted">
                    No active fuel products found.
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <label className="px-3">
              <span className="sr-only">Filter by product</span>
              <select
                aria-label="Filter by product"
                value={productFilter}
                onChange={(event) => setProductFilter(event.target.value)}
                className="h-10 w-full rounded-xl border border-line-strong bg-card px-3 text-sm text-text-high"
              >
                <option value="">All products</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.code})
                  </option>
                ))}
              </select>
            </label>
            {readingsQ.isLoading && (
              <p className="px-4 py-8 text-center text-sm text-text-muted">Loading register…</p>
            )}
            {readingsQ.isError && (
              <p
                role="alert"
                className="mx-3 rounded-xl border border-bad-line bg-bad-soft p-3 text-sm text-bad-fg"
              >
                Could not load the density register.
              </p>
            )}
            {!readingsQ.isLoading && (readingsQ.data ?? []).length === 0 && (
              <p className="mx-3 rounded-xl border border-line p-4 text-sm text-text-muted">
                No density readings match this product.
              </p>
            )}
            <div className="flex flex-col gap-2 px-3">
              {(readingsQ.data ?? []).map((reading) => (
                <RegisterReading
                  key={reading.id}
                  reading={reading}
                  tolerance={settings.densityToleranceKgM3}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} label="Record density">
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
              onClick={() => setSheetOpen(false)}
              aria-label="Close"
              className="hit-44 -mr-2 -mt-2 text-xl text-text-muted"
            >
              ×
            </button>
          </div>
          <SelectField
            label="Fuel product"
            value={productId}
            onChange={(value) => {
              setProductId(value);
              setPreviousDensity(
                today?.products.find((product) => product.productId === value)?.lastReadings[0]
                  ?.density15 ?? null,
              );
              setTankId('');
              setNozzleId('');
            }}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.code})
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-2">
            <ChoiceButton selected={kind === 'MORNING'} onClick={() => setKind('MORNING')}>
              Morning
            </ChoiceButton>
            <ChoiceButton selected={kind === 'ADHOC'} onClick={() => setKind('ADHOC')}>
              Ad-hoc
            </ChoiceButton>
          </div>
          <SelectField
            label="Entry method"
            value={entryMethod}
            onChange={(value) => setEntryMethod(value as EntryMethod)}
          >
            <option value="HYDROMETER">Hydrometer + temperature</option>
            <option value="DIRECT_15">Direct 15 °C value</option>
          </SelectField>
          {entryMethod === 'HYDROMETER' ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-card-alt p-3">
              <NumberField
                label="Observed hydrometer (kg/m³)"
                value={observedDensity}
                onChange={setObservedDensity}
                min={600}
                step={0.01}
              />
              <NumberField
                label="Observed temperature (°C)"
                value={observedTempC}
                onChange={setObservedTempC}
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
              value={density15Direct}
              onChange={setDensity15Direct}
              min={600}
              step={0.01}
            />
          )}
          <SelectField
            label="Sampled from"
            value={sampledFrom}
            onChange={(value) => {
              setSampledFrom(value as SampledFrom);
              setTankId('');
              setNozzleId('');
            }}
          >
            <option value="NONE">Unspecified</option>
            {nozzles.length > 0 && <option value="NOZZLE">Nozzle</option>}
            {tanks.length > 0 && <option value="TANK">Tank</option>}
          </SelectField>
          {sampledFrom === 'TANK' && (
            <SelectField label="Tank" value={tankId} onChange={setTankId}>
              <option value="">Select tank…</option>
              {tanks.map((tank) => (
                <option key={tank.id} value={tank.id}>
                  {tank.name}
                </option>
              ))}
            </SelectField>
          )}
          {sampledFrom === 'NOZZLE' && (
            <SelectField label="Nozzle" value={nozzleId} onChange={setNozzleId}>
              <option value="">Select nozzle…</option>
              {nozzles.map((nozzle) => (
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
          {density15 != null &&
            lastDensity != null &&
            Math.abs(density15 - lastDensity) > settings.densityToleranceKgM3 && (
              <p className="rounded-lg border border-warn-line bg-warn-soft p-2.5 text-xs text-warn-fg">
                This differs by {Math.abs(density15 - lastDensity).toFixed(2)} kg/m³ from the last
                reading. It will be saved and flagged if no Decantation explains the change.
              </p>
            )}
          <button
            type="submit"
            disabled={density15 == null || !productId || record.isPending}
            className="hit-44 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-50"
          >
            {record.isPending ? 'Saving…' : 'Save reading'}
          </button>
        </form>
      </BottomSheet>
    </DetailPage>
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

const TodayProductCard: React.FC<{
  product: DensityTodayProductSummary;
  band?: { minKgM3?: number; maxKgM3?: number };
  onRecord: () => void;
}> = ({ product, band, onRecord }) => {
  const current = product.latestToday;
  const latest = current ?? product.lastReadings[0];
  const lastReadings = product.lastReadings.length
    ? product.lastReadings
    : current
      ? [current]
      : [];
  const specText = band
    ? band.minKgM3 != null && band.maxKgM3 != null
      ? `Spec ${band.minKgM3}–${band.maxKgM3} kg/m³`
      : band.minKgM3 != null
        ? `Spec ≥ ${band.minKgM3} kg/m³`
        : `Spec ≤ ${band.maxKgM3} kg/m³`
    : null;
  return (
    <article
      aria-label={`${product.productName} (${product.productCode})`}
      className="mx-3 flex flex-col gap-2 rounded-xl border border-line bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-text-high">
            {product.productName}{' '}
            <span className="text-xs font-medium text-text-muted">({product.productCode})</span>
          </h2>
          <p className="text-[11px] text-text-muted">
            {current
              ? `Today · ${formatTime(current.recordedAt)}`
              : latest
                ? `Last reading · ${latest.businessDate}`
                : 'No readings yet'}
          </p>
        </div>
        <StatusBadge tone={current ? 'good' : 'warn'}>
          {current ? 'Recorded today' : 'Missing today'}
        </StatusBadge>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="num text-[25px] font-bold leading-none text-text-high">
          {latest ? latest.density15.toFixed(2) : '—'}
          <span className="ml-1 text-[11px] font-medium text-text-muted">kg/m³</span>
        </p>
        {specText && <span className="text-right text-[11px] text-text-muted">{specText}</span>}
      </div>
      <div className="border-t border-line pt-2">
        <p className="mb-1 text-[11px] font-semibold text-text-muted">Last readings</p>
        {lastReadings.length ? (
          lastReadings.slice(0, 3).map((reading) => (
            <p
              key={reading.id}
              className="flex justify-between gap-2 py-0.5 text-[11px] text-text-muted"
            >
              <span className="truncate">
                {reading.businessDate} · {reading.kind}
                {reading.tankName
                  ? ` · ${reading.tankName}`
                  : reading.nozzleName
                    ? ` · ${reading.nozzleName}`
                    : ''}
              </span>
              <span className="num flex-shrink-0">{reading.density15.toFixed(2)}</span>
            </p>
          ))
        ) : (
          <p className="text-[11px] text-text-faint">No previous readings</p>
        )}
      </div>
      <button
        type="button"
        onClick={onRecord}
        className="hit-44 rounded-lg border border-line px-3 text-left text-xs font-semibold text-accent"
      >
        {current ? 'Add reading' : "Record today's density"}
      </button>
    </article>
  );
};

const RegisterReading: React.FC<{ reading: DensityReadingWithContext; tolerance: number }> = ({
  reading,
  tolerance,
}) => {
  const flags = Array.isArray(reading.flags) ? reading.flags.map(String) : [];
  const jump =
    flags.includes('UNEXPLAINED_JUMP') ||
    (reading.delta != null &&
      Math.abs(reading.delta) > tolerance &&
      reading.kind !== 'DECANTATION');
  return (
    <article
      aria-label={`${reading.productName ?? reading.productId} ${reading.businessDate}`}
      className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-text-high">
            {reading.productName ?? reading.productId}{' '}
            <span className="text-[11px] font-medium text-text-muted">· {reading.productCode}</span>
          </p>
          <p className="text-[11px] text-text-muted">
            {reading.businessDate} · {formatTime(reading.recordedAt)} · {reading.kind}
          </p>
        </div>
        {jump && <StatusBadge tone="warn">Jump flagged</StatusBadge>}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-text-muted">
        <span>
          {reading.tankName ?? reading.nozzleName ?? reading.sampledFrom ?? 'Source not recorded'}
        </span>
        <span className="num">
          {reading.observedDensity == null
            ? 'Direct 15 °C'
            : `${reading.observedDensity.toFixed(1)} kg/m³ · ${reading.observedTempC?.toFixed(1) ?? '—'} °C`}
        </span>
        <span className="num font-bold text-text-high">{reading.density15.toFixed(2)} kg/m³</span>
      </div>
      {flags.length > 0 && <p className="text-[11px] text-warn-fg">{flags.join(', ')}</p>}
      <p className="text-[10px] text-text-faint">
        {reading.recordedByName ?? 'Recorded by station user'}
      </p>
    </article>
  );
};
