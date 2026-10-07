import React from 'react';
import { cn } from '../../../pump-ds/lib/cn.js';
import {
  LOCKED_SECTION,
  type Paper,
  type ReportTemplate,
  type SectionKind,
  type SectionState,
} from '../../../services/reports/reportTemplates.js';

export interface ReportPaperPreviewProps {
  template: ReportTemplate;
  sections: readonly SectionState[];
  station: any;
  paper: Paper;
  showLogo: boolean;
  /** The section to outline, e.g. the row the pointer is on. */
  highlighted?: string | null;
  onHighlight?: (key: string | null) => void;
  /** Card thumbnail: drawn at half size and clipped to its frame. */
  thumbnail?: boolean;
  className?: string;
}

/**
 * A representative page of the report: the enabled sections in print order,
 * each drawn with sample content of its kind (a table, KPI tiles, signature
 * lines), so switching a section off or moving it visibly changes the page.
 * The PDF prints the same sections in the same order.
 */
export const ReportPaperPreview: React.FC<ReportPaperPreviewProps> = ({
  template,
  sections,
  station,
  paper,
  showLogo,
  highlighted = null,
  onHighlight,
  thumbnail = false,
  className,
}) => {
  const page = (
    <div
      aria-hidden={thumbnail || undefined}
      data-testid={thumbnail ? undefined : 'report-preview'}
      className={cn(
        'flex flex-col gap-2 rounded-[4px] border border-border-soft bg-surface p-4 text-[9px] leading-snug text-ink-default shadow-sm',
        // The paper's proportions are the minimum height: a long layout grows
        // past one page rather than hiding its last sections.
        paper === 'LETTER' ? 'aspect-[8.5/11]' : 'aspect-[210/297]',
        thumbnail && 'w-[200%] origin-top-left scale-50',
        className,
      )}
    >
      {sections
        .filter((s) => s.enabled)
        .map(({ key }) =>
          key === LOCKED_SECTION ? (
            <Letterhead
              key={key}
              template={template}
              station={station}
              showLogo={showLogo}
              highlighted={highlighted === key}
              onHighlight={onHighlight}
            />
          ) : (
            <section
              key={key}
              data-section={key}
              onMouseEnter={onHighlight ? () => onHighlight(key) : undefined}
              onMouseLeave={onHighlight ? () => onHighlight(null) : undefined}
              className={cn(
                'rounded-[3px] px-1 py-0.5 ring-1 ring-transparent transition-colors',
                highlighted === key && 'bg-brand/10 ring-brand',
              )}
            >
              <h5 className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-brand">
                {template.labels[key] ?? key}
              </h5>
              <SectionBody kind={template.preview[key]} />
            </section>
          ),
        )}
    </div>
  );

  if (!thumbnail) return page;
  return <div className="h-44 overflow-hidden rounded-[6px] bg-surface-alt px-8 pt-3">{page}</div>;
};

const Letterhead: React.FC<{
  template: ReportTemplate;
  station: any;
  showLogo: boolean;
  highlighted: boolean;
  onHighlight?: (key: string | null) => void;
}> = ({ template, station, showLogo, highlighted, onHighlight }) => {
  const legal = station?.settings?.legal ?? {};
  const logo: string | undefined = station?.settings?.logo_data_url;
  const heading = legal.legalName || station?.name || 'Your station';
  const details = [
    legal.gstin ? `GSTIN ${legal.gstin}` : '',
    [legal.addressLine, legal.pincode].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <header
      data-section={LOCKED_SECTION}
      onMouseEnter={onHighlight ? () => onHighlight(LOCKED_SECTION) : undefined}
      onMouseLeave={onHighlight ? () => onHighlight(null) : undefined}
      className={cn(
        'flex items-center gap-2 rounded-[3px] border-b-2 border-brand px-1 pb-1.5 ring-1 ring-transparent',
        highlighted && 'bg-brand/10 ring-brand',
      )}
    >
      {showLogo ? (
        logo ? (
          <img src={logo} alt="" className="size-6 object-contain" />
        ) : (
          <span className="size-6 shrink-0 rounded-[4px] bg-brand" />
        )
      ) : null}
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold text-ink-strong">{heading}</span>
        <span className="block text-[7.5px] font-semibold uppercase tracking-wider text-ink-muted">
          {template.docTitle}
        </span>
        {details ? <span className="block truncate text-ink-muted">{details}</span> : null}
      </span>
    </header>
  );
};

const SectionBody: React.FC<{ kind?: SectionKind }> = ({ kind }) => {
  if (!kind) return null;
  switch (kind.kind) {
    case 'meta':
      return (
        <div className="text-ink-muted">
          {kind.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      );
    case 'note':
      return (
        <div className="rounded-[3px] bg-warning-bg px-1.5 py-0.5 text-warning-fg">{kind.text}</div>
      );
    case 'kpis':
      return (
        <div className={cn('grid gap-1', kind.tiles.length > 3 ? 'grid-cols-4' : 'grid-cols-3')}>
          {kind.tiles.map(([label, value]) => (
            <div key={label} className="rounded-[3px] bg-surface-alt px-1.5 py-1">
              <div className="text-[7px] uppercase tracking-wider text-ink-muted">{label}</div>
              <div className="font-mono text-[10px] font-semibold text-ink-strong">{value}</div>
            </div>
          ))}
        </div>
      );
    case 'table':
      return (
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="bg-surface-alt text-left text-[7.5px] uppercase tracking-wider text-ink-muted">
              {kind.columns.map((c) => (
                <th key={c} className="truncate px-1 py-0.5 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1].map((row) => (
              <tr key={row} className="border-b border-border-soft">
                {kind.columns.map((c, i) => (
                  <td key={c} className={cn('truncate px-1 py-0.5', i > 0 && 'font-mono')}>
                    {i === 0
                      ? `${c} ${row + 1}`
                      : SAMPLE_NUMBERS[(row + i) % SAMPLE_NUMBERS.length]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'signatures':
      return (
        <div className="mt-3 flex gap-6">
          {kind.roles.map((role) => (
            <div key={role} className="flex-1 border-t border-ink-strong pt-0.5 text-ink-muted">
              {role}
            </div>
          ))}
        </div>
      );
  }
};

const SAMPLE_NUMBERS = ['1,240.50', '612.00', '48,250', '3,980.25', '96.40'];
