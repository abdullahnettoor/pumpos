import React from 'react';
import {
  Button,
  DensityReading,
  Icon,
  Panel,
  deriveDensityState,
  formatDensity,
} from '../../../pump-ds/index.js';
import { formatClockInZone, formatDayMonth } from '../../../utils/format.js';
import { DeltaChip } from './DeltaChip.js';
import type { DensityTodaySummary } from '@pump/shared';

export interface TodayViewProps {
  summary: DensityTodaySummary;
  /** Station Settings spec bands, keyed by product id. */
  specBands?: Record<string, { minKgM3?: number; maxKgM3?: number }>;
  /** The station's jump tolerance (`resolveDecantationSettings`). */
  tolerance: number;
  /** The station's IANA timezone; times never use the device clock. */
  timeZone: string | undefined;
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
        <div
          data-testid="morning-save-prompt"
          className={`${BANNER} border-success-fg/30 bg-success-bg`}
        >
          <div className="flex items-center gap-2.5">
            <Icon name="check-circle" size="md" className="text-success-fg" />
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
          className={`${BANNER} border-warning-fg/30 bg-warning-bg`}
        >
          <div className="flex items-center gap-2.5 text-ink">
            <Icon name="alert-triangle" size="sm" className="text-warning-fg" />
            <div>
              <strong>
                Today's readings {summary.recordedCount}/{summary.totalProducts} products recorded.
              </strong>{' '}
              Missing today: {missingProducts.map((p) => p.productName).join(', ')}.
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
        <div className={`${BANNER} justify-start border-success-fg/30 bg-success-bg text-ink`}>
          <Icon name="check-circle" size="sm" className="text-success-fg" />
          <span>
            All {summary.totalProducts} fuel products have today's statutory density recorded.
          </span>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {summary.products.map((prod) => {
          const spec = specBands[prod.productId];
          const state = deriveDensityState(prod, summary.businessDate, tolerance);
          const isRecorded = state.kind !== 'not-recorded';

          return (
            <Panel
              key={prod.productId}
              data-testid={`density-card-${prod.productId}`}
              title={`${prod.productName} (${prod.productCode})`}
            >
              <DensityReading
                state={state}
                trend={prod.trendValues}
                timeZone={timeZone}
                businessDate={summary.businessDate}
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
                {prod.lastReadings.length === 0 ? (
                  <div className="text-[12px] text-ink-muted">No readings recorded yet</div>
                ) : (
                  prod.lastReadings.slice(0, 4).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 border-b [--tw-border-style:dashed] border-border-soft py-1 text-[12px] last:border-b-0"
                    >
                      <span className="text-ink-muted">
                        {formatDayMonth(r.businessDate)} {formatClockInZone(r.recordedAt, timeZone)}{' '}
                        · {r.kind}
                        {r.tankName ? ` · ${r.tankName}` : ''}
                        {r.nozzleName ? ` · ${r.nozzleName}` : ''}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="font-mono font-semibold tabular-nums text-ink">
                          {formatDensity(r.density15)}
                        </span>
                        <DeltaChip
                          delta={r.delta}
                          kind={r.kind}
                          flags={r.flags}
                          tolerance={tolerance}
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
                  onClick={() => onRecord(prod.productId)}
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
