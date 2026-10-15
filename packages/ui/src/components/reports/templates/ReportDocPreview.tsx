import React from 'react';
import { cn } from '../../../pump-ds/lib/cn.js';
import type {
  Paper,
  ReportTemplate,
  SectionState,
} from '../../../services/reports/reportTemplates.js';
import type {
  PreviewStation,
  TemplatePreviewInput,
} from '../../../services/reports/previewDocs.js';
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

/** The station fields a printed report reads, so an unrelated change draws nothing new. */
export function previewStation(station: any): PreviewStation | null {
  if (!station) return null;
  const settings = station.settings ?? {};
  return {
    name: station.name,
    settings: {
      legal: settings.legal,
      fuel_brand: settings.fuel_brand,
      logo_data_url: settings.logo_data_url,
      timezone: settings.timezone,
    },
  };
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
    station: previewStation(props.station),
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
  const query = usePdfPreview('report-template', templatePreviewInput(props), buildDoc, {
    width: thumbnail ? THUMBNAIL_WIDTH : DRAWER_PREVIEW_WIDTH,
    maxPages: thumbnail ? 1 : undefined,
  });
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
