import { useMemo, useState } from 'react';
import type { Station } from '@pump/shared';
import { useStations } from '../query/hooks.js';

export interface SelectedStation {
  /** The station list, or an empty array until it arrives. */
  stations: Station[];
  /** The station the operator is working in, derived from the list. */
  selectedStation: Station | null;
  /** Record an explicit choice. Null clears it, falling back to the default. */
  pickStation: (stationId: string | null) => void;
  /** The list has not settled yet — distinct from "came back empty". */
  stationsLoading: boolean;
  /** The list settled successfully (whether or not it had anything in it). */
  stationsSettled: boolean;
}

/**
 * The station list and the operator's place in it.
 *
 * Stations stream in through the query layer rather than being awaited during
 * sign-in, so the shell can be drawn as soon as we know who the user is.
 * `enabled` keys off the session rather than the resolved role, so the request
 * flies alongside the session call instead of queueing behind it.
 *
 * Selection is derived, not effect-synced. An effect would have to wait for the
 * list to arrive before it could set state — a second render, and a second
 * chance to flash — so only the operator's explicit pick is held as state and
 * everything else falls out of the list.
 *
 * Shared because desktop and console each had their own copy of this, and had
 * already drifted apart.
 */
export function useSelectedStation(hasSession: boolean): SelectedStation {
  const stationsQ = useStations({ enabled: hasSession });
  const stations = useMemo<Station[]>(() => stationsQ.data ?? [], [stationsQ.data]);

  const [pickedStationId, setPickedStationId] = useState<string | null>(null);

  const selectedStation = useMemo<Station | null>(() => {
    if (!stations.length) return null;
    const picked = pickedStationId && stations.find((s) => s.id === pickedStationId);
    if (picked) return picked;
    return stations.find((s) => s.onboardingStatus === 'READY_FOR_OPERATIONS') ?? stations[0];
  }, [stations, pickedStationId]);

  return {
    stations,
    selectedStation,
    pickStation: setPickedStationId,
    stationsLoading: hasSession && !stationsQ.isSuccess && !stationsQ.isError,
    stationsSettled: stationsQ.isSuccess,
  };
}
