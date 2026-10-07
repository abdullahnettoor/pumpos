import React from 'react';
import { Download } from 'lucide-react';
import { formatFileSize, type DownloadOption } from '@pump/shared';
import { Button, Chip, Panel } from '../../pump-ds/index.js';
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
      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}
      data-testid={`desktop-option-${option.platform}`}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
          {option.label}
          {option.recommended && (
            <span style={{ marginLeft: 8 }}>
              <Chip tone="success" size="xs">
                Recommended
              </Chip>
            </span>
          )}
        </span>
        {d.available ? (
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Version {d.version} · {formatFileSize(d.sizeBytes)}
            {!d.isLatest && ' · latest installer for this platform'}
            {option.hint && ` · ${option.hint}`}
          </span>
        ) : (
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Not available yet. Use the web console for now.
          </span>
        )}
      </span>
      {d.available && (
        <Button
          variant={option.recommended ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            markDesktopDownloaded();
            onDownloaded?.();
            startDownload(d.url);
          }}
        >
          <Download size={14} aria-hidden="true" /> Download
        </Button>
      )}
    </li>
  );
};

/**
 * Every desktop platform, recommended one first. Reads through the cached
 * downloads query; links go straight to the installer file.
 */
export const DesktopAppPanel: React.FC<{ onDownloaded?: () => void }> = ({ onDownloaded }) => {
  const { data, isLoading, isError } = useDesktopDownloads();

  return (
    <Panel title="Desktop app" flush>
      {isLoading ? (
        <p style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading downloads…</p>
      ) : isError || !data ? (
        <p style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          Downloads are temporarily unavailable. Try again shortly.
        </p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {desktopOptionsForThisBrowser(data).map((option) => (
            <OptionRow key={option.platform} option={option} onDownloaded={onDownloaded} />
          ))}
        </ul>
      )}
    </Panel>
  );
};
