import React, { useState } from 'react';
import { density15FromObserved, roundDensity } from '@pump/shared';
import { NumberField, SelectField, AddButton, TextField } from '../handover/Fields.js';

/** Small shared blocks of the Decantation flows, built from the handover's field primitives. */

export const Warn: React.FC<{ tone?: 'bad' | 'warn' | 'info'; children: React.ReactNode }> = ({
  tone = 'warn',
  children,
}) => (
  <p
    className={`rounded-xl border px-3 py-2 text-[12px] ${
      tone === 'bad'
        ? 'border-bad-line bg-bad-soft text-bad-fg'
        : tone === 'info'
          ? 'border-line bg-card-alt text-text-muted'
          : 'border-warn-line bg-warn-soft text-warn-fg'
    }`}
  >
    {children}
  </p>
);

export const Check: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  sub?: string;
}> = ({ checked, onChange, title, sub }) => (
  <label className="flex items-start gap-3 rounded-xl border border-line bg-card-alt p-3">
    <input
      type="checkbox"
      className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="min-w-0">
      <span className="block text-[13px] font-bold text-text-high">{title}</span>
      {sub && <span className="block text-[12px] text-text-muted">{sub}</span>}
    </span>
  </label>
);

export const TimeField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[12px] font-semibold text-text-muted">{label}</span>
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[46px] rounded-xl border border-line-strong bg-card-alt px-3 text-sm text-text-high focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
    />
  </label>
);

/** Hydrometer reading + temperature → density at 15 °C, by the station's method. */
export const DensityCalc: React.FC<{
  method: Parameters<typeof density15FromObserved>[2];
  onUse: (d15: number, observed: number, tempC: number) => void;
}> = ({ method, onUse }) => {
  const [open, setOpen] = useState(false);
  const [obs, setObs] = useState('');
  const [temp, setTemp] = useState('');
  let result: number | null = null;
  let error: string | null = null;
  if (obs.trim() !== '' && temp.trim() !== '') {
    try {
      result = roundDensity(density15FromObserved(Number(obs), Number(temp), method), 1);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Check the readings';
    }
  }
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-[12px] font-bold text-accent"
      >
        Calculate at 15 °C
      </button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card-alt p-3">
      <div className="grid grid-cols-2 gap-2.5">
        <NumberField label="Observed density" value={obs} onChange={setObs} meta="kg/m³" />
        <NumberField label="Temperature (°C)" value={temp} onChange={setTemp} min={-20} />
      </div>
      {error && <Warn tone="bad">{error}</Warn>}
      {result != null && (
        <button
          type="button"
          onClick={() => {
            onUse(result, Number(obs), Number(temp));
            setOpen(false);
          }}
          className="h-10 rounded-xl bg-accent text-[13px] font-bold text-on-accent"
        >
          Use {result} kg/m³ at 15 °C
        </button>
      )}
    </div>
  );
};

export { NumberField, SelectField, AddButton, TextField };
