import React, { useState } from 'react';
import { Button } from '../../../pump-ds/index.js';

/** Discard a draft with an inline two-step confirm (no modal). */
export const DiscardDraftButton: React.FC<{ busy?: boolean; onConfirm: () => void }> = ({
  busy,
  onConfirm,
}) => {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
        Discard draft
      </Button>
    );
  return (
    <span
      role="group"
      aria-label="Confirm discard draft"
      style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}
    >
      <span style={{ color: 'var(--text-muted)' }}>Discard this draft?</span>
      <Button
        variant="danger"
        size="sm"
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Confirm discard
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  );
};
