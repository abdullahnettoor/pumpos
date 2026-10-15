import React, { type ReactNode } from 'react';
import { DataSection, type SectionQuery } from '../data-section/index.js';

export interface TileSectionProps {
  /** Names the figure in "Couldn't load <title>". */
  title: string;
  query: SectionQuery | SectionQuery[];
  children: ReactNode;
}

/**
 * One KPI tile in its own Data Section, inside a `KpiStrip`: the tile waits
 * only on the queries it reads, so one failed request puts only its own tiles
 * behind Retry. Loading and error fill the tile's cell on the tile surface.
 */
export const TileSection: React.FC<TileSectionProps> = ({ title, query, children }) => (
  <DataSection
    title={title}
    query={query}
    shape="bare"
    placeholderHeight={58}
    className="bg-surface data-[state=error]:px-3.5 data-[state=error]:py-3 data-[state=loading]:px-3.5 data-[state=loading]:py-3"
  >
    {children}
  </DataSection>
);
