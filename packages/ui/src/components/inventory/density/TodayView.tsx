import React from 'react';
import { Button, DensityReading, Icon, Panel, deriveDensityState } from '../../../pump-ds/index.js';
import { formatClockInZone, formatDayMonth, formatDensity } from '../../../utils/format.js';
import { DeltaChip } from './DeltaChip.js';
import type { DensityTodaySummary } from '@pump/shared';

export interface TodayViewProps {
  summary: DensityTodaySummary;
  /** Station Settings spec bands, keyed by product id. */
  specBands?: Record<string, { minKgM3?: number; maxKgM3?: number }>;
  /** The station's jump tolerance (`resolveDecantationSettings`). */
  tolerance: number;
  /** The station's IANA timezone; times never use the device clock. */
  timeZone: string;
  morningPromptProduct: string | null;
  onDismissMorningPrompt: () => void;
  onPrintBoard: () => void;
  onRecord: (productId?: string) => void;
}

function formatBand(band: { minKgM3?: number; maxKgM3?: number }): string {
  if (band.minKgM3 != null && band.maxKgM3 != null) return `${band.minKgM3}–${band.maxKgM3}`;
  return band.minKgM3 != null ? `≥ ${band.minKgM3}` : `≤ ${band.maxKgM3}`;
}

const BANNER = 'flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-[13px]';

export const TodayView: React.FC<TodayViewProps> = ({
  summary,
  specBands = {},
  tolerance,
  timeZone,
  morningPromptProduct,
  onDismissMorningPrompt,
  onPrintBoard,
  onRecord,
}) => {
  const missingProducts = summary.missingProducts;

  return (
    <div className="flex flex-col gap-4">
      {morningPromptProduct && (
        <div data-testid="morning-save-prompt" className={`${BANNER} border-info-fg bg-info-bg`}>
          <div className="flex items-center gap-2.5">
            <Icon name="check-circle" size="md" className="text-info-fg" />
            <div>
              <strong className="text-ink">
                Morning density recorded for {morningPromptProduct}.
              </strong>
              <div className="text-[12px] text-ink-muted">
                Statutory requirement: post updated 15 °C density on the daily display board.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={onPrintBoard}>
              Print today's board
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismissMorningPrompt}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {missingProducts.length > 0 ? (
        <div
          data-testid="missing-density-banner"
          className={`${BANNER} border-warning-fg bg-warning-bg`}
        >
          <div className="flex items-center gap-2.5 text-ink">
            <Icon name="alert-triangle" size="sm" className="text-warning-fg" />
            <div>
              <strong>
                Today's readings {summary.recordedCount}/{summary.totalProducts} products recorded.
              </strong>{' '}
              Missing today: {missingProducts.map((product) => product.productName).join(', ')}.
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onRecord(missingProducts[0]?.productId)}
          >
            Record {missingProducts[0]?.productCode || 'now'}
          </Button>
        </div>
      ) : (
        <div className={`${BANNER} justify-start border-success-fg bg-success-bg text-ink`}>
          <Icon name="check-circle" size="sm" className="text-success-fg" />
          <span>
            All {summary.totalProducts} fuel products have today's statutory density recorded.
          </span>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {summary.products.map((product) => {
          const spec = specBands[product.productId];
          const state = deriveDensityState(product, summary.businessDate, tolerance);
          const isRecorded = state.kind !== 'not-recorded';

          return (
            <Panel
              key={product.productId}
              data-testid={`density-card-${product.productId}`}
              title={`${product.productName} (${product.productCode})`}
            >
              <DensityReading
                state={state}
                trend={product.trendValues}
                context={{ timeZone, businessDate: summary.businessDate }}
              />
              {spec && (
                <div className="mt-1 text-[11px] text-ink-muted">
                  Spec: {formatBand(spec)} kg/m³
                </div>
              )}

              <div className="mt-3 border-t border-border-soft pt-2">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Recent readings
                </div>
                {product.lastReadings.length === 0 ? (
                  <div className="text-[12px] text-ink-muted">No readings recorded yet</div>
                ) : (
                  product.lastReadings.slice(0, 4).map((reading) => (
                    <div
                      key={reading.id}
                      className="flex items-center justify-between gap-2 border-b [--tw-border-style:dashed] border-border-soft py-1 text-[12px] last:border-b-0"
                    >
                      <span className="text-ink-muted">
                        {formatDayMonth(reading.businessDate)}{' '}
                        {formatClockInZone(reading.recordedAt, timeZone)} · {reading.kind}
                        {reading.tankName ? ` · ${reading.tankName}` : ''}
                        {reading.nozzleName ? ` · ${reading.nozzleName}` : ''}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="font-mono font-semibold tabular-nums text-ink">
                          {formatDensity(reading.density15)}
                        </span>
                        <DeltaChip
                          delta={reading.delta}
                          kind={reading.kind}
                          flags={reading.flags}
                          tolerance={tolerance}
                          baseline="vs prev"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3.5">
                <Button
                  size="sm"
                  variant={isRecorded ? 'secondary' : 'primary'}
                  fullWidth
                  onClick={() => onRecord(product.productId)}
                >
                  {isRecorded ? 'Add reading' : "Record today's density"}
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
};
