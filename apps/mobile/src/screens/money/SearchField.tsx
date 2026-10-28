import React from 'react';
import { SearchIcon } from '../../ui/icons.js';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

/** Name search for a Money list. */
export const SearchField: React.FC<Props> = ({ value, onChange, placeholder }) => (
  <label className="mx-3 flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-text-muted focus-within:border-accent">
    <SearchIcon size={16} />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="min-w-0 flex-1 bg-transparent text-[13.5px] text-text-high placeholder:text-text-faint focus:outline-none"
    />
  </label>
);
