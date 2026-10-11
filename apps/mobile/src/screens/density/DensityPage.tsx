import React, { useMemo, useState } from 'react';
import { resolveDecantationSettings, type RecordDensityReadingPayload } from '@pump/shared';
import {
  createIdempotencyKey,
  useDensityReadings,
  useDensityTodaySummary,
  useNozzles,
  useProducts,
  useRecordDensityReading,
  useTanks,
} from '@pump/ui';
import { useShell } from '../../shell/context.js';
import { DetailPage, SegmentedControl } from '../../ui/index.js';
import { DensityRegister } from './DensityRegister.js';
import { DensityToday } from './DensityToday.js';
import { RecordDensitySheet } from './RecordDensitySheet.js';

type DensityTab = 'today' | 'register';

/** Density: Today (per-product cards), Register (all readings) and the Record sheet. */
export const DensityPage: React.FC = () => {
  const { station } = useShell();
  const stationId = station?.id;
  const settings = useMemo(
    () => resolveDecantationSettings(station?.settings),
    [station?.settings],
  );
  const [tab, setTab] = useState<DensityTab>('today');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [presetProductId, setPresetProductId] = useState('');
  const [productFilter, setProductFilter] = useState('');

  const todayQ = useDensityTodaySummary(stationId);
  const readingsQ = useDensityReadings(stationId, { productId: productFilter || undefined });
  const productsQ = useProducts();
  const tanksQ = useTanks(stationId);
  const nozzlesQ = useNozzles(stationId);
  const record = useRecordDensityReading(stationId);
  const today = todayQ.data;

  const products = useMemo(
    () =>
      (productsQ.data ?? []).filter(
        (product) => product.productType === 'FUEL' && product.isActive,
      ),
    [productsQ.data],
  );

  const openSheet = (productId?: string) => {
    setPresetProductId(productId ?? products[0]?.id ?? '');
    setSheetOpen(true);
  };

  const save = async (payload: RecordDensityReadingPayload) => {
    await record.mutateAsync({ payload, idempotencyKey: createIdempotencyKey() });
    setSheetOpen(false);
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
              <DensityToday today={today} bands={settings.densitySpecBands} onRecord={openSheet} />
            )}
          </>
        ) : (
          <DensityRegister
            products={products}
            productFilter={productFilter}
            onFilter={setProductFilter}
            readings={readingsQ.data ?? []}
            isLoading={readingsQ.isLoading}
            isError={readingsQ.isError}
            tolerance={settings.densityToleranceKgM3}
          />
        )}
      </div>

      {stationId && (
        <RecordDensitySheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          stationId={stationId}
          products={products}
          tanks={tanksQ.data ?? []}
          nozzles={nozzlesQ.data ?? []}
          presetProductId={presetProductId}
          defaultEntryMethod={settings.densityEntryMethod}
          method={settings.densityMethod}
          tolerance={settings.densityToleranceKgM3}
          lastDensityFor={(productId) =>
            today?.products.find((p) => p.productId === productId)?.lastReadings[0]?.density15 ??
            null
          }
          saving={record.isPending}
          onSave={save}
        />
      )}
    </DetailPage>
  );
};
