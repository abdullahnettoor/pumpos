/**
 * Responsive board breakpoints, measured on the board's own content width
 * (not the viewport): the sidebar and rails change how much room a page has.
 */
export const BOARD_WIDE_MIN = 1120;
export const BOARD_MEDIUM_MIN = 760;

export type BoardColumns = 1 | 2 | 3;

/** 3 columns at ≥1120px, 2 at 760–1119px, 1 below. Unmeasured (0) → 3. */
export function boardColumnsFor(width: number): BoardColumns {
  if (!(width > 0)) return 3;
  if (width >= BOARD_WIDE_MIN) return 3;
  if (width >= BOARD_MEDIUM_MIN) return 2;
  return 1;
}

export interface BoardTemplate {
  columns: string;
  /** Grid areas for the Forecourt, Fuels and Money columns, in that order. */
  areas: string | undefined;
}

/**
 * Wide: Forecourt | Fuels | Money. Medium: Fuels spans the right, Money sits
 * under Forecourt. Narrow: one stack in Forecourt, Fuels, Money order.
 */
export function boardTemplateFor(columns: BoardColumns): BoardTemplate {
  if (columns === 3) return { columns: '1.15fr 1fr 1fr', areas: '"forecourt fuels money"' };
  if (columns === 2) return { columns: '1fr 1fr', areas: '"forecourt fuels" "money fuels"' };
  return { columns: '1fr', areas: '"forecourt" "fuels" "money"' };
}
