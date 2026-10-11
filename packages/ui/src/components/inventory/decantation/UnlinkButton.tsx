import React, { useState } from 'react';
import { Button } from '../../../pump-ds/index.js';

/** Unlink with an inline two-step confirm (no modal): "Unlink" → "Confirm unlink" / "Keep". */
export const UnlinkButton: React.FC<{
  label: string;
  busy?: boolean;
  onConfirm: () => void;
}> = ({ label, busy, onConfirm }) => {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Unlink ${label}`}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        Unlink
      </Button>
    );
  return (
    <span
      role="group"
      aria-label={`Confirm unlink ${label}`}
      style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}
    >
      <span style={{ color: 'var(--text-muted)' }}>Remove this invoice link?</span>
      <Button
        variant="danger"
        size="sm"
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Confirm unlink
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  );
};
