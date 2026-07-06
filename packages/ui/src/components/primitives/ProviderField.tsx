import React, { useState } from 'react';
import { PAYMENT_PROVIDERS } from '@pump/shared';
import { Combobox } from './Combobox.js';

const OTHER = '__other__';

export interface ProviderFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Style applied to the custom-text input (shown for "Other…"). */
  style?: React.CSSProperties;
}

/**
 * Card/UPI acquirer picker: a searchable combobox of common providers plus an
 * "Other…" option that reveals a free-text input. Emits a plain string so it
 * feeds the "Auto — group by provider" clearing-account grouping. Give it a
 * `key` that changes when the edited entity changes so its Other-mode resets.
 */
export const ProviderField: React.FC<ProviderFieldProps> = ({ value, onChange, disabled, style }) => {
  const inList = PAYMENT_PROVIDERS.includes(value);
  const [other, setOther] = useState<boolean>(!inList && !!value);
  const comboValue = other ? OTHER : inList ? value : '';

  const options = [
    ...PAYMENT_PROVIDERS.map((p) => ({ value: p, label: p })),
    { value: OTHER, label: 'Other…' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Combobox
        options={options}
        value={comboValue}
        onChange={(v) => {
          if (v === OTHER) {
            setOther(true);
            onChange('');
          } else {
            setOther(false);
            onChange(v);
          }
        }}
        placeholder="Select provider…"
        searchPlaceholder="Search providers…"
        disabled={disabled}
      />
      {other && (
        <input
          className="input"
          style={style}
          type="text"
          placeholder="Provider / acquirer name"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
};
