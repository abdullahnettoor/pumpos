import React from 'react';
import {
  Button,
  Chip,
  Icon,
  Panel,
  Sparkline,
} from '../../../pump-ds/index.js';
import { DeltaChip } from './DeltaChip.js';
import type {
  DensityTodayProductSummary,
  DensityTodaySummary,
} from '@pump/shared';

export interface TodayViewProps {
  summary: DensityTodaySummary;
  specBands?: Record<string, { min: number; max: number }>;
  tolerance?: number;
  morningPromptProduct: string | null;
  onDismissMorningPrompt: () => void;
  onPrintBoard: () => void;
  onRecord: (productId?: string) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  summary,
  specBands = {},
  tolerance = 3,
  morningPromptProduct,
  onDismissMorningPrompt,
  onPrintBoard,
  onRecord,
}) => {
  const missingProducts = summary.products.filter((p) => !p.todayRecorded);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Morning save prompt banner */}
      {morningPromptProduct && (
        <div
          data-testid="morning-save-prompt"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--color-brand-subtle, #eff6ff)',
            border: '1px solid var(--color-brand-border, #bfdbfe)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="check-circle" size="md" />
            <div>
              <strong style={{ fontSize: 13, color: 'var(--color-brand-text, #1e3a8a)' }}>
                Morning density recorded for {morningPromptProduct}.
              </strong>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted, #4b5563)' }}>
                Statutory requirement: post updated 15 °C density on the daily display board.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="sm" variant="primary" onClick={onPrintBoard}>
              Print today's board
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismissMorningPrompt}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Missing check banner */}
      {missingProducts.length > 0 ? (
        <div
          data-testid="missing-density-banner"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            borderRadius: 8,
            background: 'var(--color-warning-subtle, #fffbeb)',
            border: '1px solid var(--color-warning-border, #fef3c7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="alert-triangle" size="sm" />
            <div style={{ fontSize: 13, color: 'var(--color-warning-text, #92400e)' }}>
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 8,
            background: 'var(--color-success-subtle, #f0fdf4)',
            border: '1px solid var(--color-success-border, #bbf7d0)',
            fontSize: 13,
            color: 'var(--color-success-text, #166534)',
          }}
        >
          <Icon name="check-circle" size="sm" />
          <span>
            All {summary.totalProducts} fuel products have today's statutory density recorded.
          </span>
        </div>
      )}

      {/* Grid of Product Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        {summary.products.map((prod) => {
          const spec = specBands[prod.productCode];
          const latest = prod.latestToday || prod.lastReadings[0] || null;
          const trendNumbers = prod.trend14d
            .map((t) => t.density15)
            .filter((n): n is number => n !== null);

          const isRecorded = prod.todayRecorded && prod.latestToday;
          const recordedTime = prod.latestToday?.recordedAt
            ? new Date(prod.latestToday.recordedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';

          return (
            <Panel
              key={prod.productId}
              title={`${prod.productName} (${prod.productCode})`}
              action={
                isRecorded ? (
                  <Chip size="sm" tone="success">
                    Recorded {recordedTime}
                  </Chip>
                ) : (
                  <Chip size="sm" tone="warning">
                    Today missing
                  </Chip>
                )
              }
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted, #6b7280)' }}>
                    {isRecorded ? "Today's density at 15 °C" : 'Last reading'}
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      opacity: isRecorded ? 1 : 0.6,
                      lineHeight: 1.1,
                      marginTop: 2,
                    }}
                  >
                    {latest ? latest.density15.toFixed(1) : '— — —'}
                    <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6 }}> kg/m³</span>
                  </div>
                  {spec && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-text-muted, #6b7280)',
                        marginTop: 4,
                      }}
                    >
                      Spec: {spec.min}–{spec.max} kg/m³
                    </div>
                  )}
                </div>

                {trendNumbers.length > 1 && (
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--color-text-muted, #9ca3af)',
                        marginBottom: 2,
                      }}
                    >
                      14-day trend
                    </div>
                    <Sparkline data={trendNumbers} width={110} height={34} tone="brand" fill />
                  </div>
                )}
              </div>

              {/* Recent readings list */}
              <div
                style={{
                  borderTop: '1px solid var(--color-border, #f3f4f6)',
                  paddingTop: 8,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-text-muted, #6b7280)',
                    marginBottom: 6,
                  }}
                >
                  Recent Readings
                </div>
                {prod.lastReadings.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted, #9ca3af)' }}>
                    No readings recorded yet
                  </div>
                ) : (
                  prod.lastReadings.slice(0, 4).map((r) => {
                    const time = new Date(r.recordedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const date = r.businessDate ? r.businessDate.slice(5) : '';
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 12,
                          padding: '4px 0',
                          borderBottom: '1px dashed var(--color-border, #f3f4f6)',
                        }}
                      >
                        <span style={{ color: 'var(--color-text-muted, #4b5563)' }}>
                          {date} {time} · {r.kind}
                          {r.tankName ? ` · ${r.tankName}` : ''}
                          {r.nozzleName ? ` · ${r.nozzleName}` : ''}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {r.density15.toFixed(1)}
                          </strong>
                          <DeltaChip
                            delta={r.delta}
                            kind={r.kind}
                            flags={r.flags}
                            tolerance={tolerance}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom quick record button */}
              <div style={{ marginTop: 14 }}>
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
