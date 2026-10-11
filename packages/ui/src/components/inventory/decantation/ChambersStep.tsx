import React from 'react';
import { useFieldArray } from 'react-hook-form';
import { Button, Chip, Icon } from '../../../pump-ds/index.js';
import { NumberInput, Select } from '../../primitives/Field.js';
import { LINE_COLORS, Notice } from './StepSection.js';
import { emptyChamber } from './decantationForm.js';
import { fmtLitres } from './format.js';
import { lineLabel, type StepProps } from './stepShared.js';

const MARKS: { value: 'OK' | 'SHORT' | 'EXCESS'; label: string; tone: string }[] = [
  { value: 'OK', label: 'OK', tone: 'success' },
  { value: 'SHORT', label: 'Short', tone: 'danger' },
  { value: 'EXCESS', label: 'Excess', tone: 'info' },
];

export const ChambersStep: React.FC<StepProps> = ({ form, values, tanks, flags }) => {
  const { register, setValue, control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'chambers' });
  const cell: React.CSSProperties = { padding: '4px 6px', fontSize: 12, verticalAlign: 'middle' };
  const short = flags.flags.find((f) => f.code === 'TANKER_SHORT');
  return (
    <>
      <label
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <input
          type="checkbox"
          style={{ marginTop: 3 }}
          {...register('checkChambers', {
            onChange: (e) => {
              // First time on: start with one chamber so the table is not empty.
              if (e.target.checked && form.getValues('chambers').length === 0)
                append(emptyChamber(0));
            },
          })}
        />
        <span>
          Check tanker chambers
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
            Optional: seal, dip mark and which tank each chamber goes into
          </span>
        </span>
      </label>
      {values.checkChambers && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={cell}>#</th>
                <th style={cell}>Qty (L)</th>
                <th style={cell}>Into</th>
                <th style={cell}>Seal OK</th>
                <th style={cell}>Dip mark</th>
                <th style={cell}>Dip (mm)</th>
                <th style={cell}>Emptied</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, i) => {
                const c = values.chambers[i];
                return (
                  <tr key={field.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td style={cell}>{i + 1}</td>
                    <td style={{ ...cell, width: 90 }}>
                      <NumberInput
                        aria-label={`Chamber ${i + 1} quantity`}
                        {...register(`chambers.${i}.capacity`)}
                      />
                    </td>
                    <td style={{ ...cell, width: 150 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            flexShrink: 0,
                            background:
                              c?.lineIndex == null
                                ? 'var(--border-strong, #cbd5e1)'
                                : LINE_COLORS[c.lineIndex % LINE_COLORS.length],
                          }}
                        />
                        <Select
                          aria-label={`Chamber ${i + 1} into tank`}
                          {...register(`chambers.${i}.lineIndex`, {
                            setValueAs: (x) => (x === '' || x == null ? null : Number(x)),
                          })}
                        >
                          <option value="">Not assigned</option>
                          {values.lines.map((l, j) => (
                            <option key={j} value={j}>
                              {lineLabel(tanks, l.tankId, j)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                    <td style={cell}>
                      <input
                        type="checkbox"
                        aria-label={`Chamber ${i + 1} seal OK`}
                        {...register(`chambers.${i}.sealOk`)}
                      />
                    </td>
                    <td style={cell}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {MARKS.map((m) => {
                          const on = c?.mark === m.value;
                          return (
                            <button
                              key={m.value}
                              type="button"
                              aria-pressed={on}
                              aria-label={`Chamber ${i + 1} ${m.label}`}
                              onClick={() =>
                                setValue(`chambers.${i}.mark`, on ? '' : m.value, {
                                  shouldDirty: true,
                                })
                              }
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                border: '1px solid var(--border-strong)',
                                background: on ? `var(--state-${m.tone}-bg)` : 'transparent',
                                color: on ? `var(--state-${m.tone}-fg)` : 'var(--text-default)',
                                fontWeight: on ? 600 : 400,
                              }}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ ...cell, width: 80 }}>
                      <NumberInput
                        placeholder="—"
                        aria-label={`Chamber ${i + 1} dip mm`}
                        {...register(`chambers.${i}.dipMm`)}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        type="checkbox"
                        aria-label={`Chamber ${i + 1} emptied`}
                        {...register(`chambers.${i}.emptied`)}
                      />
                    </td>
                    <td style={cell}>
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label={`Remove chamber ${i + 1}`}
                        onClick={() => remove(i)}
                      >
                        <Icon name="x" size="xs" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Button
            variant="outline"
            size="xs"
            leftIcon={<Icon name="plus" size="xs" />}
            onClick={() => append(emptyChamber(0))}
          >
            Add chamber
          </Button>
          {short && (
            <Notice tone="danger">
              <strong>{short.message}.</strong> Likely a transit loss. It will be flagged.
            </Notice>
          )}
          {flags.warnings.map((w) => (
            <Notice key={`${w.code}-${w.chamberNo ?? ''}`} tone="info">
              {w.message}
            </Notice>
          ))}
        </>
      )}
    </>
  );
};

export const ChambersSummary: React.FC<StepProps> = ({ values, tanks }) =>
  !values.checkChambers ? (
    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chambers not checked</span>
  ) : (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {values.chambers.map((c, i) => (
        <Chip
          key={i}
          size="sm"
          tone={
            c.mark === 'SHORT' || !c.sealOk
              ? 'danger'
              : c.mark === 'EXCESS'
                ? 'info'
                : c.mark === 'OK'
                  ? 'success'
                  : 'neutral'
          }
        >
          #{i + 1} {c.capacity ? fmtLitres(Number(c.capacity)) : '—'} →{' '}
          {c.lineIndex == null
            ? 'not assigned'
            : lineLabel(tanks, values.lines[c.lineIndex]?.tankId ?? '', c.lineIndex)}
          {c.mark ? ` · ${c.mark.toLowerCase()}` : ''}
          {!c.sealOk ? ' · seal broken' : ''}
          {c.emptied ? ' · emptied' : ''}
        </Chip>
      ))}
    </div>
  );
