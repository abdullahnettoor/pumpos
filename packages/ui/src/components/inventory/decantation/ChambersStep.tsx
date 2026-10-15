import React, { useMemo } from 'react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import { Button, Chip, Icon, InteractiveTable, type TableColumn } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import { NumberInput, Select } from '../../primitives/Field.js';
import { Notice } from './StepSection.js';
import { emptyChamber, type DecantationFormValues } from './decantationForm.js';
import { formatQuantity } from '../../../utils/format.js';
import { lineLabel, lineSwatch, type StepProps, type TankOption } from './stepShared.js';

type Mark = 'OK' | 'SHORT' | 'EXCESS';

const MARKS: { value: Mark; label: string }[] = [
  { value: 'OK', label: 'OK' },
  { value: 'SHORT', label: 'Short' },
  { value: 'EXCESS', label: 'Excess' },
];

/** A pressed mark toggle: Short is a problem (red), Excess informational, OK success. */
const MARK_ON: Record<Mark, string> = {
  OK: 'border-success-fg bg-success-bg text-success-fg hover:bg-success-bg active:bg-success-bg',
  SHORT: 'border-danger-fg bg-danger-bg text-danger-fg hover:bg-danger-bg active:bg-danger-bg',
  EXCESS: 'border-info-fg bg-info-bg text-info-fg hover:bg-info-bg active:bg-info-bg',
};

const CHECKBOX = 'accent-brand';

type Form = UseFormReturn<DecantationFormValues>;
interface ChamberRow {
  id: string;
  index: number;
}

/** "Into" cell: line dot + tank select. Watches its own field so the grid stays mounted. */
const IntoCell: React.FC<{ form: Form; tanks: TankOption[]; i: number }> = ({ form, tanks, i }) => {
  const lineIndex = useWatch({ control: form.control, name: `chambers.${i}.lineIndex` });
  const lines = useWatch({ control: form.control, name: 'lines' }) ?? [];
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-full',
          lineIndex == null ? 'bg-border-strong' : lineSwatch(lineIndex),
        )}
      />
      <Select
        aria-label={`Chamber ${i + 1} into tank`}
        {...form.register(`chambers.${i}.lineIndex`, {
          setValueAs: (x) => (x === '' || x == null ? null : Number(x)),
        })}
      >
        <option value="">Not assigned</option>
        {lines.map((l, j) => (
          <option key={j} value={j}>
            {lineLabel(tanks, l.tankId, j)}
          </option>
        ))}
      </Select>
    </div>
  );
};

/** Dip mark toggles: OK / Short / Excess; pressing the pressed one clears it. */
const MarkCell: React.FC<{ form: Form; i: number }> = ({ form, i }) => {
  const mark = useWatch({ control: form.control, name: `chambers.${i}.mark` });
  return (
    <div className="flex gap-1">
      {MARKS.map((m) => {
        const on = mark === m.value;
        return (
          <Button
            key={m.value}
            variant="secondary"
            size="xs"
            aria-pressed={on}
            aria-label={`Chamber ${i + 1} ${m.label}`}
            className={cn(on ? MARK_ON[m.value] : 'font-normal')}
            onClick={() =>
              form.setValue(`chambers.${i}.mark`, on ? '' : m.value, { shouldDirty: true })
            }
          >
            {m.label}
          </Button>
        );
      })}
    </div>
  );
};

export const ChambersStep: React.FC<StepProps> = ({ form, values, tanks, flags }) => {
  const { register, control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'chambers' });
  const short = flags.flags.find((f) => f.code === 'TANKER_SHORT');
  const rows = useMemo<ChamberRow[]>(
    () => fields.map((f, index) => ({ id: f.id, index })),
    [fields],
  );
  // Stable across keystrokes: the table builds a cell component per definition, so
  // rebuilding the columns would remount (and blur) the inputs on every change.
  const columns = useMemo<TableColumn<ChamberRow>[]>(
    () => [
      {
        id: 'no',
        header: '#',
        kind: 'text',
        sortable: false,
        width: '32px',
        value: (r) => r.index + 1,
      },
      {
        id: 'qty',
        header: 'Qty (L)',
        kind: 'text',
        sortable: false,
        width: '90px',
        value: () => null,
        cell: ({ index: i }) => (
          <NumberInput
            aria-label={`Chamber ${i + 1} quantity`}
            {...register(`chambers.${i}.capacity`)}
          />
        ),
      },
      {
        id: 'into',
        header: 'Into',
        kind: 'text',
        sortable: false,
        width: '150px',
        value: () => null,
        cell: ({ index: i }) => <IntoCell form={form} tanks={tanks} i={i} />,
      },
      {
        id: 'seal',
        header: 'Seal OK',
        kind: 'text',
        sortable: false,
        value: () => null,
        cell: ({ index: i }) => (
          <input
            type="checkbox"
            className={CHECKBOX}
            aria-label={`Chamber ${i + 1} seal OK`}
            {...register(`chambers.${i}.sealOk`)}
          />
        ),
      },
      {
        id: 'mark',
        header: 'Dip mark',
        kind: 'text',
        sortable: false,
        value: () => null,
        cell: ({ index: i }) => <MarkCell form={form} i={i} />,
      },
      {
        id: 'dip',
        header: 'Dip (mm)',
        kind: 'text',
        sortable: false,
        width: '80px',
        value: () => null,
        cell: ({ index: i }) => (
          <NumberInput
            placeholder="—"
            aria-label={`Chamber ${i + 1} dip mm`}
            {...register(`chambers.${i}.dipMm`)}
          />
        ),
      },
      {
        id: 'emptied',
        header: 'Emptied',
        kind: 'text',
        sortable: false,
        value: () => null,
        cell: ({ index: i }) => (
          <input
            type="checkbox"
            className={CHECKBOX}
            aria-label={`Chamber ${i + 1} emptied`}
            {...register(`chambers.${i}.emptied`)}
          />
        ),
      },
      {
        id: 'remove',
        header: '',
        kind: 'text',
        sortable: false,
        value: () => null,
        cell: ({ index: i }) => (
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Remove chamber ${i + 1}`}
            onClick={() => remove(i)}
          >
            <Icon name="x" size="xs" />
          </Button>
        ),
      },
    ],
    [form, register, remove, tanks],
  );
  return (
    <>
      <label className="mb-3 flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          className={cn(CHECKBOX, 'mt-[3px]')}
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
          <span className="block text-[12px] text-ink-muted">
            Optional: seal, dip mark and which tank each chamber goes into
          </span>
        </span>
      </label>
      {values.checkChambers && (
        <>
          <div className="mb-1.5">
            <InteractiveTable<ChamberRow>
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              bare
              dense
              title="chambers"
              emptyMessage="No chambers yet."
            />
          </div>
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
    <span className="text-[12px] text-ink-muted">Chambers not checked</span>
  ) : (
    <div className="flex flex-wrap gap-1.5">
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
          #{i + 1} {c.capacity ? formatQuantity(Number(c.capacity), 'L') : '—'} →{' '}
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
