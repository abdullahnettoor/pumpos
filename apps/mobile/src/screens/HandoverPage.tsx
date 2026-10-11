import React, { useRef, useState } from 'react';
import { HandoverPanel } from '../components/HandoverPanel.js';
import { formatRecordedTime } from '../lib/handover/recap.js';
import { useOwnHandover } from '../lib/handover/useOwnHandover.js';
import { useStationTimeZone } from '../shell/context.js';
import { useBack, useBackGuard } from '../ui/backStack.js';
import { BottomSheet, DetailPage, StatusBadge } from '../ui/index.js';

/**
 * The owner / manager's own handover as a detail page (back to Home), opened
 * from the pinned Home card. The form is the shared `HandoverPanel`; its one
 * Save handover action sits in this page's bottom action bar, and exists only
 * while there is a handover to save (never before it loads, nor after the Shift
 * closes). The header badge is what the server holds (Saved / Not saved), never
 * what is typed. Going back with unsaved edits asks before discarding them.
 *
 *   nav.push(<HandoverPage />, 'handover')
 */
export const HandoverPage: React.FC = () => {
  const timeZone = useStationTimeZone();
  const own = useOwnHandover(true, timeZone);
  const back = useBack();
  // The bar's slot lives in the page's ActionBar; the form portals its Save into it.
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const discarding = useRef(false);

  // Back (button or system gesture) with unsaved edits asks first. Back again
  // while it asks is the system gesture, and means "keep editing".
  useBackGuard(dirty, () => {
    if (discarding.current) return true;
    setAsking((open) => !open);
    return false;
  });
  const discard = () => {
    discarding.current = true;
    setAsking(false);
    back();
  };

  const since = formatRecordedTime(own?.openedAt, timeZone);
  const subtitle = own
    ? [own.shiftName, own.duLabel, since ? `since ${since}` : null].filter(Boolean).join(' · ')
    : undefined;

  return (
    <DetailPage
      title="Your handover"
      subtitle={subtitle}
      right={
        own ? (
          <StatusBadge tone={own.saved ? 'good' : 'muted'}>
            {own.saved ? 'Saved' : 'Not saved'}
          </StatusBadge>
        ) : undefined
      }
      // No bar while the assignment loads or once there is nothing to save (the Shift closed).
      actions={own ? <div ref={setBarSlot} className="contents" /> : undefined}
    >
      <div className="px-4">
        {/* Never the form's own sticky bar: no slot, no Save. */}
        <HandoverPanel
          actionBarTarget={own ? barSlot : null}
          onDirtyChange={setDirty}
          timeZone={timeZone}
        />
      </div>
      <BottomSheet
        open={asking}
        onClose={() => setAsking(false)}
        label="Discard changes?"
        backLayer={false}
      >
        <div className="flex flex-col gap-3 px-4">
          <div>
            <h2 className="m-0 text-base font-extrabold text-text-high">Discard changes?</h2>
            <p className="m-0 mt-1 text-[13px] text-text-muted">
              What you typed is not saved. Leaving now loses it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="h-12 rounded-xl bg-accent text-sm font-semibold text-on-accent"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={discard}
            className="h-12 rounded-xl border border-bad-line bg-bad-soft text-sm font-semibold text-bad-fg"
          >
            Discard changes
          </button>
        </div>
      </BottomSheet>
    </DetailPage>
  );
};
