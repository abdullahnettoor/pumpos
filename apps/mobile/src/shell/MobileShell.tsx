import React, { useCallback, useMemo, useState } from 'react';
import type { Station } from '@pump/shared';
import { AccountSheet } from './AccountSheet.js';
import { ShellContext } from './context.js';
import { Dock } from './Dock.js';
import { useNav } from './nav.js';
import { Pane } from './Pane.js';
import { tabDef, type TabKey } from './tabs.js';

interface MobileShellProps {
  userName: string;
  role: string;
  stations: Station[];
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  onSignOut: () => void;
  /** A tab's own screen (its header included). Pushed detail pages come from `useNav().push`. */
  renderRoot: (tab: TabKey) => React.ReactNode;
}

/**
 * The Control Room shell for Owner / Manager / Accountant / Staff: pages in
 * their own scroll panes, the floating dock (hidden on detail pages, whose
 * bottom action bar takes its place), and the Account sheet.
 *
 * Every tab opened so far stays mounted, hidden, so a tab keeps its local
 * state, scroll position and pushed pages while another tab is showing.
 * Switching station remounts them all: pages belong to a station.
 */
export const MobileShell: React.FC<MobileShellProps> = ({
  userName,
  role,
  stations,
  selectedStationId,
  onSelectStation,
  onSignOut,
  renderRoot,
}) => {
  const nav = useNav();
  const [accountOpen, setAccountOpen] = useState(false);
  const openAccount = useCallback(() => setAccountOpen(true), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  const station = stations.find((s) => s.id === selectedStationId) ?? null;
  const ctx = useMemo(
    () => ({ station, stationName: station?.name ?? 'PumpOS', userName, role, openAccount }),
    [station, userName, role, openAccount],
  );

  const selectStation = (id: string) => {
    if (id === selectedStationId) return;
    nav.reset();
    onSelectStation(id);
  };

  return (
    <ShellContext.Provider value={ctx}>
      <div className="mobile-safe-top flex h-[100dvh] flex-col bg-background text-text-default">
        <div className="relative min-h-0 flex-1" key={selectedStationId ?? 'no-station'}>
          {nav.visited.map((tab) => {
            const stack = nav.stacks[tab] ?? [];
            const tabActive = tab === nav.active;
            return (
              <React.Fragment key={tab}>
                <Pane
                  active={tabActive && stack.length === 0}
                  bottom={tabDef(tab).reserveDock ? 'above-dock' : 'under-dock'}
                >
                  {renderRoot(tab)}
                </Pane>
                {stack.map((entry, i) => (
                  <Pane key={entry.id} active={tabActive && i === stack.length - 1} bottom="full">
                    {entry.element}
                  </Pane>
                ))}
              </React.Fragment>
            );
          })}
          {nav.depth === 0 && (
            <Dock tabs={nav.tabs} active={nav.active} onSelect={(tab) => nav.select(tab)} />
          )}
        </div>
      </div>
      <AccountSheet
        open={accountOpen}
        onClose={closeAccount}
        userName={userName}
        role={role}
        stations={stations}
        selectedStationId={selectedStationId}
        onSelectStation={selectStation}
        onSignOut={onSignOut}
      />
    </ShellContext.Provider>
  );
};
