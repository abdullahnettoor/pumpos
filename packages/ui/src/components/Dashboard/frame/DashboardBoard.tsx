import React from 'react';
import { ForecourtColumn } from '../columns/ForecourtColumn.js';
import { FuelsColumn } from '../columns/FuelsColumn.js';
import { MoneyColumn } from '../columns/MoneyColumn.js';
import { boardColumnsFor, boardTemplateFor } from './boardLayout.js';
import { useContainerWidth } from '../../../hooks/useContainerWidth.js';

/**
 * The responsive board. Layout follows the board's own width (see
 * boardLayout.ts). Each column is its own component (columns/); nothing sits
 * full-width below them.
 */
export const DashboardBoard: React.FC = () => {
  const [ref, width] = useContainerWidth<HTMLDivElement>();
  const columns = boardColumnsFor(width);
  const template = boardTemplateFor(columns);
  const column = 'flex min-w-0 flex-col gap-3';
  return (
    <div
      ref={ref}
      data-testid="dashboard-board"
      data-columns={columns}
      className="grid items-start gap-3"
      style={{ gridTemplateColumns: template.columns, gridTemplateAreas: template.areas }}
    >
      <section className={column} style={{ gridArea: 'forecourt' }}>
        <ForecourtColumn />
      </section>
      <section className={column} style={{ gridArea: 'fuels' }}>
        <FuelsColumn />
      </section>
      <section className={column} style={{ gridArea: 'money' }}>
        <MoneyColumn />
      </section>
    </div>
  );
};
