import React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Chip, DataSection } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import type { PdfPageImage } from './usePdfPreview.js';

export interface PdfPreviewProps {
  /** From `usePdfPreview`. */
  query: UseQueryResult<PdfPageImage[]>;
  /** Names the preview in its loading and error lines ("Couldn't load the … preview"). */
  title: string;
  /** Height of the placeholder while the first drawing loads. */
  placeholderHeight: number;
  /** Read by assistive tech for each page image. */
  alt: string;
  className?: string;
}

/**
 * The drawn pages of a PDF preview (#605): each page as an image, the way it
 * prints. While a newer drawing is on its way the current pages stay and a
 * small "Updating…" chip says so; a failed drawing reads "Couldn't load … ·
 * Retry", like any other section.
 */
export const PdfPreview: React.FC<PdfPreviewProps> = ({
  query,
  title,
  placeholderHeight,
  alt,
  className,
}) => {
  const pages = query.data ?? [];
  const updating = query.isPlaceholderData || (query.isFetching && pages.length > 0);
  return (
    <DataSection title={title} query={query} placeholderHeight={placeholderHeight} shape="bare">
      <div className={cn('relative flex flex-col gap-3', className)} data-testid="pdf-preview">
        {pages.map((page, i) => (
          <img
            key={i}
            src={page.src}
            width={page.width}
            height={page.height}
            alt={pages.length > 1 ? `${alt}, page ${i + 1} of ${pages.length}` : alt}
            className="h-auto w-full rounded-[4px] border border-border-soft shadow-sm"
          />
        ))}
        {updating ? (
          <Chip size="md" className="absolute top-2 right-2" aria-live="polite">
            Updating…
          </Chip>
        ) : null}
      </div>
    </DataSection>
  );
};
