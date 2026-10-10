import React from 'react';
import { LockIcon } from '../../ui/icons.js';

/** Shown only while the Business Day is open: its DSSR is a preview, not the sealed record. */
export const DssrDraftBanner: React.FC = () => (
  <div
    role="note"
    className="mx-3 flex items-center gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-3 py-2.5"
  >
    <span className="flex-shrink-0 text-warn-fg">
      <LockIcon size={16} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[12.5px] font-semibold text-text-high">Draft · day not closed</p>
      <p className="text-[11px] text-text-muted">
        Numbers can change until the day is closed on desktop and the DSSR is sealed.
      </p>
    </div>
  </div>
);
