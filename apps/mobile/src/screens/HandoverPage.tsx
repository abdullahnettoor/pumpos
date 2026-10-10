import React, { useState } from 'react';
import { HandoverPanel } from '../components/HandoverPanel.js';
import { useOwnHandover } from '../lib/handover/useOwnHandover.js';
import { DetailPage, StatusBadge } from '../ui/index.js';
import { formatRecordedTime } from './attendant/recap.js';

/**
 * The owner / manager's own handover as a detail page (back to Home), opened
 * from the pinned Home card. The form is the shared `HandoverPanel`; its one
 * Save handover action sits in this page's bottom action bar. The header badge
 * is what the server holds (Saved / Not saved), never what is typed.
 *
 *   nav.push(<HandoverPage />, 'handover')
 */
export const HandoverPage: React.FC = () => {
  const own = useOwnHandover();
  // The bar's slot lives in the page's ActionBar; the form portals its Save into it.
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);

  const since = formatRecordedTime(own?.openedAt);
  const subtitle = own
    ? [own.shiftName, own.duLabel, since ? `since ${since}` : null].filter(Boolean).join(' · ')
    : undefined;

  return (
    <DetailPage
      title="My handover"
      subtitle={subtitle}
      right={
        own ? (
          <StatusBadge tone={own.saved ? 'good' : 'muted'}>
            {own.saved ? 'Saved' : 'Not saved'}
          </StatusBadge>
        ) : undefined
      }
      // No bar once there is nothing to save (the Shift closed).
      actions={own ? <div ref={setBarSlot} className="contents" /> : undefined}
    >
      <div className="px-4">
        <HandoverPanel actionBarTarget={own ? barSlot : undefined} />
      </div>
    </DetailPage>
  );
};
