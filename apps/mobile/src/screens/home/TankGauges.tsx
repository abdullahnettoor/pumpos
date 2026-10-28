import React from 'react';
import { TANK_TONE_LABEL } from '@pump/shared';
import type { TankGauge, TankGaugeLevel } from '../../lib/home/figures.js';

const FILL: Record<TankGaugeLevel, string> = {
  critical: 'bg-bad',
  low: 'bg-warn',
  ok: 'bg-good',
  unknown: 'bg-text-faint',
};
/** The headline's colour: a problem only (low / critical), as on desktop; otherwise plain. */
const TEXT: Record<TankGaugeLevel, string> = {
  critical: 'text-bad',
  low: 'text-warn',
  ok: 'text-text-high',
  unknown: 'text-text-muted',
};

/** One tank takes the full width, two split it, three or more fill three columns. */
const GAUGE_COLUMNS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};
const gaugeColumns = (count: number): string =>
  GAUGE_COLUMNS[Math.min(Math.max(count, 1), 3) as 1 | 2 | 3];

/**
 * Mobile keeps its own tube (#520), but the tone (`t.level`) and its word
 * come only from the shared tank model; these maps are just its palette.
 *
 * A tube gauge per tank: fill, then the stock as the headline (`13,000 L`)
 * with `of 20,000 L · 65%` under it, as desktop's tank cards (#603, #609), and
 * days of cover (when the tank has sales history). Amber or red only when the
 * tank is low or critical (#520).
 */
export const TankGauges: React.FC<{ tanks: readonly TankGauge[] }> = ({ tanks }) => (
  <div className={`grid ${gaugeColumns(tanks.length)} gap-2 px-3`}>
    {tanks.map((t) => (
      <div
        key={t.id}
        data-level={t.level}
        className="flex items-stretch gap-2.5 rounded-[14px] border border-line bg-card p-2.5"
      >
        <div
          aria-hidden="true"
          className="relative h-[74px] w-4 flex-shrink-0 overflow-hidden rounded-md bg-track"
        >
          <i
            className={`absolute inset-x-0 bottom-0 ${FILL[t.level]}`}
            style={{ height: `${t.fill}%` }}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-text-high">{t.title}</p>
          <p
            className={`num mt-1.5 whitespace-nowrap text-sm font-semibold leading-tight ${TEXT[t.level]}`}
          >
            {t.pct === null ? '—' : t.stock}
            {TANK_TONE_LABEL[t.level] && (
              <span className="sr-only"> {TANK_TONE_LABEL[t.level]}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-text-muted">
            {/* `of 20,000 L` and `65%` on their own lines; a figure keeps its unit
                (only "of" may wrap), so a narrow card never splits `1,00,000 L`. */}
            {t.detail.split(' · ').map((part) => (
              <span key={part} className="num block">
                {part.replace(/ (?=\S+$)/, '\u00a0')}
              </span>
            ))}
            <span className="block truncate">{t.tankName}</span>
          </p>
          {t.cover && (
            <p className="num mt-0.5 text-xs leading-snug text-text-muted">
              <span className="sr-only">Cover </span>
              {t.cover}
            </p>
          )}
          {t.waitingOnDecantation && (
            <p className="mt-1 text-xs font-semibold leading-snug text-warn-fg">
              Waiting on decantation
            </p>
          )}
        </div>
      </div>
    ))}
  </div>
);
