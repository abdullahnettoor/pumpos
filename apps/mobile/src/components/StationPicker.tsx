import React from 'react';
import type { Station } from '@pump/shared';

interface StationPickerProps {
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Horizontal chip row for choosing the active station. */
export const StationPicker: React.FC<StationPickerProps> = ({ stations, selectedId, onSelect }) => {
  if (stations.length <= 1) return null;
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
      {stations.map((s) => {
        const isActive = s.id === selectedId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className="whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition"
            style={{
              backgroundColor: isActive ? 'var(--brand-primary)' : 'var(--bg-surface)',
              borderColor: isActive ? 'var(--brand-primary)' : 'var(--border-soft)',
              color: isActive ? '#fff' : 'var(--text-default)',
            }}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
};
