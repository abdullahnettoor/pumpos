import React, { useMemo, useState } from 'react';
import { Button, Icon, SegmentedControl } from '../../../pump-ds/index.js';
import {
  useDensityReadings,
  useDensityTodaySummary,
  useInvalidateOperational,
  useNozzles,
  useProducts,
  useStations,
  useTanks,
} from '../../../query/hooks.js';
import { CloudTransactionService } from '../../../services/cloud.js';
import { TodayView } from './TodayView.js';
import { RegisterView } from './RegisterView.js';
import { RecordDensityDrawer } from './RecordDensityDrawer.js';
import { printDensityBoard } from './printDensityBoard.js';
import type { RecordDensityReadingPayload } from '@pump/shared';

export interface DensityTabProps {
  stationId: string;
}

const txService = new CloudTransactionService();

export const DensityTab: React.FC<DensityTabProps> = ({ stationId }) => {
  const [view, setView] = useState<'today' | 'register'>('today');
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [presetProductId, setPresetProductId] = useState<string | undefined>(undefined);
  const [morningPromptProduct, setMorningPromptProduct] = useState<string | null>(null);

  const invalidateOperational = useInvalidateOperational();

  const stationsQ = useStations();
  const station = stationsQ.data?.find((s) => s.id === stationId);
  const productsQ = useProducts();
  const tanksQ = useTanks(stationId);
  const nozzlesQ = useNozzles(stationId);

  const todayQ = useDensityTodaySummary(stationId);
  const readingsQ = useDensityReadings(stationId);

  const fuelProducts = useMemo(() => {
    return (productsQ.data ?? []).filter(
      (p) => p.productType === 'FUEL' && p.isActive,
    );
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
    await txService.recordDensity(payload);
    await invalidateOperational(stationId);

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

  const specBands = useMemo(() => {
    const bands: Record<string, { min: number; max: number }> = {};
    const settings = station?.settings;
    if (settings && (settings as any).densitySpecBands) {
      const b = (settings as any).densitySpecBands;
      if (b.MS) bands.MS = b.MS;
      if (b.HSD) bands.HSD = b.HSD;
    }
    // Standard default spec bands for MS and HSD if not set
    if (!bands.MS) bands.MS = { min: 720, max: 775 };
    if (!bands.HSD) bands.HSD = { min: 820, max: 860 };
    return bands;
  }, [station]);

  const tolerance =
    (station?.settings as any)?.densityTolerance ?? 3.0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header controls: Segmented switch (Today | Register) + Print Board + Record */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <SegmentedControl
          aria-label="Density view"
          options={[
            { value: 'today', label: 'Today' },
            { value: 'register', label: 'Register' },
          ]}
          value={view}
          onChange={(v) => setView(v as 'today' | 'register')}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            leftIcon={<Icon name="plus" size="sm" />}
          >
            Record density
          </Button>
        </div>
      </div>

      {/* Main View */}
      {view === 'today' ? (
        todayQ.isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', opacity: 0.6 }}>
            Loading density today summary...
          </div>
        ) : todayQ.data ? (
          <TodayView
            summary={todayQ.data}
            specBands={specBands}
            tolerance={tolerance}
            morningPromptProduct={morningPromptProduct}
            onDismissMorningPrompt={() => setMorningPromptProduct(null)}
            onPrintBoard={handlePrintBoard}
            onRecord={handleOpenRecord}
          />
        ) : (
          <div style={{ padding: 32, textAlign: 'center', opacity: 0.6 }}>
            No summary data available
          </div>
        )
      ) : readingsQ.isLoading ? (
        <div style={{ padding: 32, textAlign: 'center', opacity: 0.6 }}>
          Loading density register...
        </div>
      ) : (
        <RegisterView
          readings={readingsQ.data ?? []}
          products={fuelProducts}
          tolerance={tolerance}
        />
      )}

      {/* Record Density Drawer */}
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
        tolerance={tolerance}
      />
    </div>
  );
};
