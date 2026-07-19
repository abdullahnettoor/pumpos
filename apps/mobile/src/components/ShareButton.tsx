import React, { useState } from 'react';

const DownloadIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" />
    <path d="m7 12 5 4 5-4" />
    <path d="M5 21h14" />
  </svg>
);

interface Props {
  /** Generates the PDF and routes it to the share sheet / download. */
  onShare: () => Promise<void>;
  label?: string;
  onError?: (message: string) => void;
  iconOnly?: boolean;
}

/** Small "share / download PDF" button with a busy state, used across reports. */
export const ShareButton: React.FC<Props> = ({ onShare, label = 'Share', onError, iconOnly }) => {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    onError?.('');
    try {
      await onShare();
    } catch (e: any) {
      onError?.(e?.message ?? 'Could not generate the PDF.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      aria-label={label}
      className={
        iconOnly
          ? 'grid h-8 w-8 place-items-center rounded-lg border disabled:opacity-50'
          : 'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50'
      }
      style={{ borderColor: 'var(--border-soft)', color: 'var(--brand-primary)' }}
    >
      <DownloadIcon />
      {!iconOnly && (busy ? 'Preparing…' : label)}
    </button>
  );
};
