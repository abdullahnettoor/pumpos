import React, { useMemo, useRef, useState } from 'react';
import {
  Button,
  DataSection,
  EmptyState,
  Icon,
  SectionHeader,
  SegmentedControl,
} from '../../../pump-ds/index.js';
import { formatDayMonth } from '../../../utils/format.js';
import { countOf } from '../../../utils/ledgerWindow.js';
import { officeSubmitKeys, type SubmitKeySession } from '../../../office-records/submitKeys.js';
import {
  useDensityReadings,
  useDensityTodaySummary,
  useNozzles,
  useProducts,
  useRecordDensityReading,
  useStations,
  useTanks,
} from '../../../query/hooks.js';
import { TodayView } from './TodayView.js';
import { RegisterFilters, RegisterView } from './RegisterView.js';
import {
  ALL_DENSITY_READINGS,
  filterDensityReadings,
  type DensityRegisterFilter,
} from './densityKind.js';
import { RecordDensityDrawer } from './RecordDensityDrawer.js';
import { printDensityBoard } from './printDensityBoard.js';
import {
  businessDateSettings,
  resolveDecantationSettings,
  type RecordDensityReadingPayload,
} from '@pump/shared';

export interface DensityTabProps {
  stationId: string;
}

const readingCount = (n: number) => countOf(n, 'reading', 'readings');

export const DensityTab: React.FC<DensityTabProps> = ({ stationId }) => {
  const [view, setView] = useState<'today' | 'register'>('today');
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [presetProductId, setPresetProductId] = useState<string | undefined>(undefined);
  const [morningPromptProduct, setMorningPromptProduct] = useState<string | null>(null);
  const [registerFilter, setRegisterFilter] = useState<DensityRegisterFilter>(ALL_DENSITY_READINGS);

  const recordDensity = useRecordDensityReading(stationId);

  const stationsQ = useStations();
  const station = stationsQ.data?.find((s) => s.id === stationId);
  const productsQ = useProducts();
  const tanksQ = useTanks(stationId);
  const nozzlesQ = useNozzles(stationId);

  const todayQ = useDensityTodaySummary(stationId);
  const readingsQ = useDensityReadings(stationId);

  const fuelProducts = useMemo(() => {
    return (productsQ.data ?? []).filter((p) => p.productType === 'FUEL' && p.isActive);
  }, [productsQ.data]);

  const registerRows = useMemo(
    () => filterDensityReadings(readingsQ.data ?? [], registerFilter),
    [readingsQ.data, registerFilter],
  );
  const isFiltered = registerFilter.productId !== '' || registerFilter.kind !== '';

  const fuelTanks = useMemo(() => {
    const fuelIds = new Set(fuelProducts.map((p) => p.id));
    return (tanksQ.data ?? []).filter((t) => fuelIds.has(t.productId));
  }, [tanksQ.data, fuelProducts]);

  const fuelNozzles = useMemo(() => {
    const fuelIds = new Set(fuelProducts.map((p) => p.id));
    return (nozzlesQ.data ?? []).filter((n) => fuelIds.has(n.productId));
  }, [nozzlesQ.data, fuelProducts]);

  // One Idempotency-Key per logical save, through the shared key store: kept
  // while a save's outcome is unknown (drop, 5xx), renewed after a decided
  // answer, so a retry cannot record the same reading twice.
  const keys = useRef<SubmitKeySession | null>(null);
  const handleOpenRecord = (prodId?: string) => {
    keys.current = officeSubmitKeys.session(`density:${stationId}`);
    setPresetProductId(prodId);
    setIsRecordOpen(true);
  };

  const handleSaveDensity = async (payload: RecordDensityReadingPayload) => {
    const session = (keys.current ??= officeSubmitKeys.session(`density:${stationId}`));
    const idempotencyKey = session.next(JSON.stringify(payload));
    try {
      await recordDensity.mutateAsync({ payload, idempotencyKey });
      session.settle();
    } catch (err) {
      session.settle(err);
      throw err;
    }

    if (payload.kind === 'MORNING') {
      const prod = fuelProducts.find((p) => p.id === payload.productId);
      setMorningPromptProduct(prod ? prod.name : 'product');
    }
  };

  const stationName = station?.name || 'Retail Outlet';

  const handlePrintBoard = () => {
    if (todayQ.data) {
      printDensityBoard(todayQ.data, stationName);
    }
  };

  // Station Settings (#464) are the only source of spec bands, tolerance, method and entry
  // default, and reading times use the station's timezone. Until the station loads there is
  // neither, so nothing that depends on them renders (no device clock, no default tolerance).
  const stationSettings = useMemo(
    () =>
      station
        ? {
            ...resolveDecantationSettings(station.settings),
            timeZone: businessDateSettings(station.settings).timeZone,
          }
        : null,
    [station],
  );

  const todayView = (
    <DataSection
      title="today's density"
      query={[stationsQ, todayQ]}
      placeholderHeight={320}
      shape="cards"
      isEmpty={!stationSettings || !todayQ.data}
      empty={
        <EmptyState
          compact
          icon={<Icon name="droplet" size="md" />}
          title={stationSettings ? 'No density summary for today' : 'Station settings unavailable'}
          description={
            stationSettings
              ? 'Record a reading to start today’s density board.'
              : 'Density needs the station’s timezone and tolerance from Station Settings.'
          }
        />
      }
    >
      {stationSettings && todayQ.data && (
        <TodayView
          summary={todayQ.data}
          specBands={stationSettings.densitySpecBands}
          tolerance={stationSettings.densityToleranceKgM3}
          timeZone={stationSettings.timeZone}
          morningPromptProduct={morningPromptProduct}
          onDismissMorningPrompt={() => setMorningPromptProduct(null)}
          onPrintBoard={handlePrintBoard}
          onRecord={handleOpenRecord}
        />
      )}
    </DataSection>
  );

  const registerView = (
    <DataSection
      title="density register"
      query={[stationsQ, readingsQ]}
      placeholderHeight={320}
      flush
      isEmpty={!stationSettings || registerRows.length === 0}
      empty={
        <div className="p-3">
          <EmptyState
            compact
            icon={<Icon name="droplet" size="md" />}
            title={
              !stationSettings
                ? 'Station settings unavailable'
                : isFiltered
                  ? 'No matching readings'
                  : 'No density readings yet'
            }
            description={
              !stationSettings
                ? 'Density needs the station’s timezone and tolerance from Station Settings.'
                : isFiltered
                  ? 'Change the product or routine filter.'
                  : 'Record a reading to see it here.'
            }
          />
        </div>
      }
    >
      {stationSettings && (
        <RegisterView
          readings={registerRows}
          tolerance={stationSettings.densityToleranceKgM3}
          timeZone={stationSettings.timeZone}
        />
      )}
    </DataSection>
  );

  const subtitle =
    view === 'register'
      ? readingsQ.data
        ? readingCount(registerRows.length)
        : undefined
      : todayQ.data
        ? formatDayMonth(todayQ.data.businessDate)
        : undefined;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title={view === 'register' ? 'Density register' : "Today's density"}
        subtitle={subtitle}
        controls={{
          filters: (
            <>
              <SegmentedControl
                aria-label="Density view"
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'register', label: 'Register' },
                ]}
                value={view}
                onChange={(v) => setView(v)}
              />
              {view === 'register' && (
                <RegisterFilters
                  products={fuelProducts}
                  readings={readingsQ.data ?? []}
                  value={registerFilter}
                  onChange={setRegisterFilter}
                />
              )}
            </>
          ),
          actions: (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrintBoard}
                disabled={!todayQ.data}
                leftIcon={<Icon name="printer" size="sm" />}
              >
                Print board
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleOpenRecord()}
                disabled={!stationSettings}
                leftIcon={<Icon name="plus" size="sm" />}
              >
                Record density
              </Button>
            </div>
          ),
        }}
      />

      {view === 'register' ? registerView : todayView}

      {/* Record Density Drawer: needs the station's tolerance and defaults */}
      {stationSettings && (
        <RecordDensityDrawer
          isOpen={isRecordOpen}
          onClose={() => {
            setIsRecordOpen(false);
            setPresetProductId(undefined);
          }}
          onSave={handleSaveDensity}
          stationId={stationId}
          products={fuelProducts}
          tanks={fuelTanks}
          nozzles={fuelNozzles}
          presetProductId={presetProductId}
          tolerance={stationSettings.densityToleranceKgM3}
          defaultMethod={stationSettings.densityMethod}
          defaultEntryMethod={stationSettings.densityEntryMethod}
        />
      )}
    </section>
  );
};
