import React from 'react';
import { cn } from '../../../pump-ds/lib/cn.js';
import type {
  Paper,
  ReportTemplate,
  SectionState,
} from '../../../services/reports/reportTemplates.js';
import type { TemplatePreviewInput } from '../../../services/reports/previewDocs.js';
import { letterheadFromStation } from '../../../services/reports/letterhead.js';
import { usePdfPreview } from '../pdf-preview/usePdfPreview.js';
import { PdfPreview } from '../pdf-preview/PdfPreview.js';

export interface ReportDocPreviewProps {
  template: ReportTemplate;
  sections: readonly SectionState[];
  station: any;
  paper: Paper;
  showLogo: boolean;
  /** Card thumbnail: the top of the first page, clipped to its frame. */
  thumbnail?: boolean;
  className?: string;
}

/** What the preview prints: the template, its enabled sections in order, the page settings. */
export function templatePreviewInput(
  props: Pick<ReportDocPreviewProps, 'template' | 'sections' | 'station' | 'paper' | 'showLogo'>,
): TemplatePreviewInput {
  return {
    template: props.template.id,
    sections: props.sections.filter((s) => s.enabled).map((s) => s.key),
    paper: props.paper,
    showLogo: props.showLogo,
    station: props.station
      ? { name: props.station.name, timeZone: props.station.settings?.timezone }
      : null,
    // The export's own builder (legal name else name, address fallback, logo),
    // so the preview cannot drift from what prints.
    letterhead: letterheadFromStation(props.station),
  };
}

const buildDoc = async (input: TemplatePreviewInput) =>
  (await import('../../../services/reports/previewDocs.js')).templatePreviewDoc(input);

/** Drawn widths: a card thumbnail, and the drawer's preview column. */
const THUMBNAIL_WIDTH = 320;
export const DRAWER_PREVIEW_WIDTH = 420;

/**
 * The report as it prints (#605): the real PDF document — the Shift Summary,
 * DSR or Attendant Handover Report — laid out with the template's sections,
 * order, paper and logo, on sample data, drawn from the same bytes the export
 * saves. In the drawer every page shows and the drawing follows each change a
 * moment later; on a card, the top of the first page.
 */
export const ReportDocPreview: React.FC<ReportDocPreviewProps> = ({
  thumbnail = false,
  className,
  ...props
}) => {
  const query = usePdfPreview(
    thumbnail ? 'report-template-card' : 'report-template-drawer',
    templatePreviewInput(props),
    buildDoc,
    {
      width: thumbnail ? THUMBNAIL_WIDTH : DRAWER_PREVIEW_WIDTH,
      maxPages: thumbnail ? 1 : undefined,
      // The drawer's pages (every page, at full width) go when it closes.
      keepCached: thumbnail,
    },
  );
  const name = `${props.template.name} preview`;
  const ratio = props.paper === 'LETTER' ? 11 / 8.5 : 297 / 210;

  if (thumbnail) {
    return (
      <div
        aria-hidden
        className={cn('h-44 overflow-hidden rounded-[6px] bg-surface-alt px-8 pt-3', className)}
      >
        <PdfPreview query={query} title={name} alt={name} placeholderHeight={160} />
      </div>
    );
  }
  return (
    <PdfPreview
      query={query}
      title={name}
      alt={`${props.template.name} on sample data`}
      placeholderHeight={Math.round(DRAWER_PREVIEW_WIDTH * ratio)}
      className={className}
    />
  );
};
