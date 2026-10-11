// PROTOTYPE — throwaway. Density at 15 °C calculator (ASTM D1250 / Table 53B
// style), shown like the cash denomination popup.
import React, { useState } from 'react';
import { Button, Icon } from '../../../pump-ds/index.js';
import { Field, NumberInput } from '../../primitives/Field.js';

const alpha = (rho15: number) => {
  if (rho15 < 770.9) return 346.4228 / rho15 ** 2 + 0.4388 / rho15;
  if (rho15 < 787.5) return -0.00336312 + 2680.3206 / rho15 ** 2;
  if (rho15 < 838.3) return 594.5418 / rho15 ** 2;
  return 186.9696 / rho15 ** 2 + 0.4862 / rho15;
};

const vcf = (rho15: number, t: number) => {
  const a = alpha(rho15);
  const dt = t - 15;
  return Math.exp(-a * dt * (1 + 0.8 * a * dt));
};

export const density15 = (observed: number, tempC: number) => {
  let r = observed;
  for (let i = 0; i < 6; i++) r = observed / vcf(r, tempC);
  return +r.toFixed(1);
};

export const DensityCalculator: React.FC<{
  onUse?: (rho15: number, observed: number, temp: number) => void;
  compact?: boolean;
}> = ({ onUse, compact }) => {
  const [open, setOpen] = useState(false);
  const [obs, setObs] = useState('');
  const [temp, setTemp] = useState('');
  const o = Number(obs);
  const t = Number(temp);
  const ok = o > 600 && o < 1100 && temp !== '';
  const result = ok ? density15(o, t) : null;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        variant="ghost"
        size="xs"
        leftIcon={<Icon name="calculator" size="xs" />}
        onClick={() => setOpen((v) => !v)}
      >
        {compact ? '15 °C' : 'Calculate at 15 °C'}
      </Button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 60,
            width: 280,
            background: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-border-strong, #ddd)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Density calculator
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Hydrometer (kg/m³)" style={{ marginBottom: 0 }}>
              <NumberInput value={obs} onChange={(e) => setObs(e.target.value)} />
            </Field>
            <Field label="Temp (°C)" style={{ marginBottom: 0 }}>
              <NumberInput value={temp} onChange={(e) => setTemp(e.target.value)} />
            </Field>
          </div>
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 6,
              background: 'var(--color-surface-alt, #f5f5f5)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
            }}
          >
            <span>At 15 °C</span>
            <strong>{result != null ? `${result} kg/m³` : '—'}</strong>
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
            Method: ASTM D1250 (station setting). Guide only — use your OMC booklet if it
            differs.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
            <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
              Close
            </Button>
            {onUse && (
              <Button
                size="xs"
                disabled={result == null}
                onClick={() => {
                  if (result != null) onUse(result, o, t);
                  setOpen(false);
                }}
              >
                Use value
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
