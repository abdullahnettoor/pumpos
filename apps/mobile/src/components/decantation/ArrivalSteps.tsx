import React from 'react';
import { emptyChamber } from '@pump/ui';
import { fmtLitres } from '../../lib/decantation/format.js';
import type { Visit } from '../../lib/decantation/useVisit.js';
import {
  AddButton,
  Check,
  DensityCalc,
  NumberField,
  SelectField,
  TextField,
  TimeField,
  Warn,
} from './fields.js';

/** Step 1: the tanker and, per product, the Fuel Purchase invoice it brings (optional). */
export const TankerStep: React.FC<{ visit: Visit; showErrors: boolean }> = ({
  visit: v,
  showErrors,
}) => (
  <>
    <div className="grid grid-cols-2 gap-2.5">
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Tanker no."
          value={v.values.tankerNumber}
          placeholder="KL-07-CB-4412"
          onChange={(x) => v.patch({ tankerNumber: x })}
        />
        {showErrors && v.errors.tanker && (
          <p role="alert" className="text-[11px] text-bad-fg">
            {v.errors.tanker}
          </p>
        )}
      </div>
      <TextField
        label="Driver"
        value={v.values.driverName}
        onChange={(x) => v.patch({ driverName: x })}
      />
    </div>
    <p className="text-[11.5px] font-semibold text-text-muted">
      Fuel Purchases · one per product · optional
    </p>
    {v.fuelProducts.map((p) => {
      const options = v.purchases[p.id] ?? [];
      return (
        <SelectField
          key={p.id}
          label={`${p.name} invoice`}
          value={v.values.links[p.id] ?? ''}
          onChange={(id) => v.setLink(p.id, id)}
        >
          <option value="">Not linked yet</option>
          {options.map((o) => (
            <option key={o.purchaseId} value={o.purchaseId}>
              {[o.invoiceNumber ?? o.documentNumber, o.supplierName, fmtLitres(o.invoiceQty)]
                .filter(Boolean)
                .join(' · ')}
            </option>
          ))}
        </SelectField>
      );
    })}
    {Object.values(v.values.links).every((x) => !x) && (
      <Warn tone="info">No invoice yet? Link it later from the Decantations list.</Warn>
    )}
  </>
);

/** Step 2: each tank unloaded into, with its before dip and RO density at 15 °C. */
export const TanksStep: React.FC<{ visit: Visit; showErrors: boolean }> = ({
  visit: v,
  showErrors,
}) => (
  <>
    {v.values.lines.map((l, i) => {
      const tank = v.tanks.find((t) => t.id === l.tankId);
      const err = v.errors.lines[i];
      const flagged = v.flags.flags.some(
        (f) => f.code === 'DENSITY_OUT_OF_TOLERANCE' && f.tankLineId === String(i),
      );
      return (
        <div key={i} className="flex flex-col gap-2.5 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-bold text-text-high">
              {tank ? `${tank.name} · ${tank.productName}` : `Tank ${i + 1}`}
            </span>
            {v.values.lines.length > 1 && (
              <button
                type="button"
                aria-label={`Remove tank ${i + 1}`}
                className="text-[12px] font-semibold text-bad-fg"
                onClick={() => v.removeLine(i)}
              >
                Remove
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <SelectField
              label={`Tank ${i + 1}`}
              value={l.tankId}
              onChange={(id) => v.setLine(i, { tankId: id })}
            >
              <option value="">Choose tank</option>
              {v.tanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.productName}
                </option>
              ))}
            </SelectField>
            {showErrors && err?.tank && (
              <p role="alert" className="text-[11px] text-bad-fg">
                {err.tank}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField
              label="Before dip (L)"
              ariaLabel={`Before dip (L) tank ${i + 1}`}
              value={l.beforeDip}
              meta={
                tank?.currentVolume != null ? `Book ${fmtLitres(tank.currentVolume)}` : undefined
              }
              error={showErrors ? err?.beforeDip : undefined}
              onChange={(x) => v.setLine(i, { beforeDip: x })}
            />
            <NumberField
              label="RO density"
              ariaLabel={`RO density tank ${i + 1}`}
              value={l.roDensity}
              meta="kg/m³ at 15 °C"
              onChange={(x) => v.setLine(i, { roDensity: x })}
            />
          </div>
          <DensityCalc
            method={v.settings.densityMethod}
            onUse={(d15, observed, tempC) =>
              v.setLine(i, {
                roDensity: String(d15),
                observedDensity: String(observed),
                observedTempC: String(tempC),
              })
            }
          />
          {flagged && (
            <Warn tone="bad">
              Density is outside the invoice tolerance. You can continue; it will be flagged.
            </Warn>
          )}
        </div>
      );
    })}
    <AddButton onClick={v.addLine}>+ Add tank</AddButton>
  </>
);

const MARKS: ['OK' | 'SHORT' | 'EXCESS', string][] = [
  ['OK', 'OK'],
  ['SHORT', 'Short'],
  ['EXCESS', 'Excess'],
];

/** Step 3: the tanker's chambers, only when the checkbox is on. */
export const ChambersStep: React.FC<{ visit: Visit }> = ({ visit: v }) => (
  <>
    <Check
      checked={v.values.checkChambers}
      onChange={(b) =>
        v.patch({
          checkChambers: b,
          chambers: b && v.values.chambers.length === 0 ? [emptyChamber(0)] : v.values.chambers,
        })
      }
      title="Check tanker chambers"
      sub="Optional: seal, dip mark, which tank"
    />
    {v.values.checkChambers &&
      v.values.chambers.map((c, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-bold text-text-high">Chamber {i + 1}</span>
            <label className="flex items-center gap-1.5 text-[12px] text-text-muted">
              <input
                type="checkbox"
                checked={c.sealOk}
                onChange={(e) => v.setChamber(i, { sealOk: e.target.checked })}
              />
              Seal OK
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField
              label="Capacity (L)"
              ariaLabel={`Chamber ${i + 1} capacity (L)`}
              value={c.capacity}
              onChange={(x) => v.setChamber(i, { capacity: x })}
            />
            <SelectField
              label="Into"
              value={String(c.lineIndex)}
              onChange={(x) => v.setChamber(i, { lineIndex: Number(x) })}
            >
              {v.values.lines.map((l, j) => (
                <option key={j} value={j}>
                  {v.tanks.find((t) => t.id === l.tankId)?.name ?? `Tank ${j + 1}`}
                </option>
              ))}
            </SelectField>
          </div>
          <div
            className="grid grid-cols-3 gap-1.5"
            role="radiogroup"
            aria-label={`Chamber ${i + 1} dip mark`}
          >
            {MARKS.map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={c.mark === m}
                onClick={() => v.setChamber(i, { mark: c.mark === m ? '' : m })}
                className={`h-10 rounded-xl border text-[13px] font-bold ${
                  c.mark === m
                    ? m === 'SHORT'
                      ? 'border-bad bg-bad-soft text-bad-fg'
                      : 'border-accent bg-accent-soft text-accent'
                    : 'border-line-strong text-text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    {v.values.checkChambers && <AddButton onClick={v.addChamber}>+ Add chamber</AddButton>}
  </>
);

/** Step 4: when the unloading started (the tanker has just arrived). */
export const StartStep: React.FC<{ visit: Visit }> = ({ visit: v }) => (
  <TimeField
    label="Start time"
    value={v.values.unloadStart}
    onChange={(x) => v.patch({ unloadStart: x })}
  />
);
