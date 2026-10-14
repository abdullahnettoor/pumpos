import React, { useMemo, useState } from 'react';
import { Button, Icon, SegmentedControl } from '../../../pump-ds/index.js';
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
import { RegisterView } from './RegisterView.js';
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

/** Loading / unavailable line in place of a view. */
const STATUS = 'p-8 text-center text-[13px] text-ink-muted';

export const DensityTab: React.FC<DensityTabProps> = ({ stationId }) => {
  const [view, setView] = useState<'today' | 'register'>('today');
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [presetProductId, setPresetProductId] = useState<string | undefined>(undefined);
  const [morningPromptProduct, setMorningPromptProduct] = useState<string | null>(null);

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

  const fuelTanks = useMemo(() => {
    const fuelIds = new Set(fuelProducts.map((p) => p.id));
    return (tanksQ.data ?? []).filter((t) => fuelIds.has(t.productId));
  }, [tanksQ.data, fuelProducts]);

  const fuelNozzles = useMemo(() => {
    const fuelIds = new Set(fuelProducts.map((p) => p.id));
    return (nozzlesQ.data ?? []).filter((n) => fuelIds.has(n.productId));
  }, [nozzlesQ.data, fuelProducts]);

  const handleOpenRecord = (prodId?: string) => {
    setPresetProductId(prodId);
    setIsRecordOpen(true);
  };

  const handleSaveDensity = async (payload: RecordDensityReadingPayload) => {
    await recordDensity.mutateAsync({ payload });

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

  const mainView = () => {
    if (!stationSettings) {
      return (
        <div className={STATUS}>
          {stationsQ.isError ? "Couldn't load station settings" : 'Loading station settings...'}
        </div>
      );
    }
    const { densitySpecBands, densityToleranceKgM3, timeZone } = stationSettings;
    if (view === 'register') {
      return readingsQ.isLoading ? (
        <div className={STATUS}>Loading density register...</div>
      ) : (
        <RegisterView
          readings={readingsQ.data ?? []}
          products={fuelProducts}
          tolerance={densityToleranceKgM3}
          timeZone={timeZone}
        />
      );
    }
    if (todayQ.isLoading) {
      return <div className={STATUS}>Loading density today summary...</div>;
    }
    if (!todayQ.data) {
      return <div className={STATUS}>No summary data available</div>;
    }
    return (
      <TodayView
        summary={todayQ.data}
        specBands={densitySpecBands}
        tolerance={densityToleranceKgM3}
        timeZone={timeZone}
        morningPromptProduct={morningPromptProduct}
        onDismissMorningPrompt={() => setMorningPromptProduct(null)}
        onPrintBoard={handlePrintBoard}
        onRecord={handleOpenRecord}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header controls: Segmented switch (Today | Register) + Print Board + Record */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SegmentedControl
          aria-label="Density view"
          options={[
            { value: 'today', label: 'Today' },
            { value: 'register', label: 'Register' },
          ]}
          value={view}
          onChange={(v) => setView(v)}
        />

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
            variant="primary"
            size="sm"
            onClick={() => handleOpenRecord()}
            disabled={!stationSettings}
            leftIcon={<Icon name="plus" size="sm" />}
          >
            Record density
          </Button>
        </div>
      </div>

      {mainView()}

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
    </div>
  );
};
