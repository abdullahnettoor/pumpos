import { useCallback, useState } from 'react';

const KEY = 'pumpos_dashboard_timeline_collapsed';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether the timeline is collapsed to one line; remembered per device. */
export function useTimelineCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(read);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        /* storage blocked: lasts for this session only */
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}
