import React from 'react';
import { Download } from 'lucide-react';
import { formatFileSize, type DownloadOption } from '@pump/shared';
import { Button, Chip, DataSection, SectionHeader } from '../../pump-ds/index.js';
import { useDesktopDownloads } from '../../query/hooks.js';
import {
  desktopOptionsForThisBrowser,
  markDesktopDownloaded,
  startDownload,
} from './desktopDownload.js';

const OptionRow: React.FC<{ option: DownloadOption; onDownloaded?: () => void }> = ({
  option,
  onDownloaded,
}) => {
  const d = option.download;
  return (
    <li
      className="flex items-center gap-3 px-4 py-3"
      data-testid={`desktop-option-${option.platform}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-strong">
          {option.label}
          {option.recommended && (
            <Chip tone="neutral" size="md">
              Recommended
            </Chip>
          )}
        </span>
        <span className="text-[12px] text-ink-muted">
          {d.available
            ? `Version ${d.version} · ${formatFileSize(d.sizeBytes)}${
                d.isLatest ? '' : ` · newer releases don't include a ${option.label} installer yet`
              }`
            : 'Not available yet. Use the web console for now.'}
        </span>
      </span>
      {d.available && (
        <Button
          variant={option.recommended ? 'primary' : 'secondary'}
          size="sm"
          leftIcon={<Download size={14} aria-hidden="true" />}
          onClick={() => {
            markDesktopDownloaded();
            onDownloaded?.();
            startDownload(d.url);
          }}
        >
          Download
        </Button>
      )}
    </li>
  );
};

/**
 * Every desktop platform, recommended one first, in its own Data Section
 * (#538). Reads through the cached downloads query; links go straight to the
 * installer file.
 */
export const DesktopAppPanel: React.FC<{ onDownloaded?: () => void }> = ({ onDownloaded }) => {
  const downloadsQ = useDesktopDownloads();

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Desktop app"
        subtitle="Runs on the office computer, even when the connection drops"
      />
      <DataSection title="desktop downloads" query={downloadsQ} placeholderHeight={120} flush>
        <ul className="m-0 list-none divide-y divide-border-soft p-0">
          {downloadsQ.data &&
            desktopOptionsForThisBrowser(downloadsQ.data).map((option) => (
              <OptionRow key={option.platform} option={option} onDownloaded={onDownloaded} />
            ))}
        </ul>
      </DataSection>
    </section>
  );
};
