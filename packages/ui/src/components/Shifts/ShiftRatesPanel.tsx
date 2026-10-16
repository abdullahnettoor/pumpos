import React from 'react';
import {
  Button,
  DataSection,
  Icon,
  Panel,
  StatusChip,
  type SectionQuery,
} from '../../pump-ds/index.js';
import { withNextStep } from '../primitives/ToastProvider.js';
import { formatMoney } from '../../utils/format.js';
import type { WriteEntry } from '../../query/pendingWrites.js';
import {
  formatPriceTime,
  unconfirmedAttempt,
  type FuelPriceRow,
  type FuelPriceWriteVars,
} from '../StationSetup/fuelPriceRows.js';

/**
 * "Rates for this shift" (#619): the rate each fuel sells at for the whole
 * shift, which is its current price when the shift opens, and since when.
 * "Change price ›" opens the Pricing drawer over the form; the rates update
 * in place when the server answers. A change in flight or refused reads here
 * as it does on the Pricing card (#606). A change scheduled after the shift
 * reads as quiet secondary text; one during it is the form's warning.
 */
export const ShiftRatesPanel: React.FC<{
  rows: readonly FuelPriceRow[];
  query: SectionQuery[];
  timeZone: string;
  writes: ReadonlyMap<string, WriteEntry<FuelPriceWriteVars>>;
  /** Absent when the user may not change a price: the rates are read-only. */
  onChangePrice?: (row: FuelPriceRow) => void;
  /**
   * Fuels whose scheduled change falls during this shift: the warning above
   * Open shift names those. Any other scheduled change reads here, quietly.
   */
  changingDuringShift?: ReadonlySet<string>;
}> = ({ rows, query, timeZone, writes, onChangePrice, changingDuringShift }) => (
  <Panel title="Rates for this shift">
    <DataSection
      title="fuel rates"
      query={query}
      placeholderHeight={72}
      shape="bare"
      isEmpty={rows.length === 0}
      empty={<p className="text-[12px] text-ink-muted">No fuel products at this station.</p>}
    >
      <ul aria-label="Rates for this shift" className="flex flex-col divide-y divide-border-soft">
        {rows.map((row) => {
          const write = writes.get(row.productId);
          return (
            <li
              key={row.productId}
              data-testid="shift-rate"
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
            >
              <span className="w-[140px] shrink-0 truncate text-[13px] font-medium text-ink-strong">
                {row.productName}
              </span>
              <span className="w-[120px] shrink-0">
                {write?.state === 'saving' ? (
                  <StatusChip status="saving" />
                ) : row.price == null ? (
                  <span className="text-[13px] text-ink-faint">Not set</span>
                ) : (
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-ink-strong">
                    {formatMoney(row.price)}/{row.unit}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-ink-muted">
                {write?.state === 'failed' ? (
                  <span role="alert" className="text-danger-fg">
                    {unconfirmedAttempt(write)
                      ? "Couldn't confirm the new rate. Use Change price to try again."
                      : withNextStep(
                          `Not saved: ${write.error?.message || 'the server refused the new rate'}`,
                          'Use Change price to try again.',
                        )}
                  </span>
                ) : (
                  <>
                    {row.effectiveFrom
                      ? `since ${formatPriceTime(row.effectiveFrom, timeZone)}`
                      : 'No price recorded yet'}
                    {row.scheduled && !changingDuringShift?.has(row.productId) && (
                      // A change after this shift: information, not a warning.
                      <span data-testid="shift-rate-next" className="text-ink-faint">
                        {' · '}Next: {formatMoney(row.scheduled.price)}/{row.unit} from{' '}
                        {formatPriceTime(row.scheduled.effectiveFrom, timeZone)}
                      </span>
                    )}
                  </>
                )}
              </span>
              {onChangePrice && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={write?.state === 'saving'}
                  onClick={() => onChangePrice(row)}
                  aria-label={`Change price of ${row.productName}`}
                  rightIcon={<Icon name="chevron-right" size="sm" />}
                >
                  Change price
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </DataSection>
    {/* Said even while the rates fail to load: the server decides, not this screen. */}
    <p className="mt-3 text-[12px] text-ink-muted">
      Rates are fixed by the server&apos;s time when you open the shift.
    </p>
  </Panel>
);
