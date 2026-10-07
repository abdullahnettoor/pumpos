import React, { useState } from 'react';
import { Drawer } from '../../Drawer.js';
import { Switch } from '../../primitives/Toggle.js';
import { useConfirm } from '../../primitives/ConfirmDialog.js';
import { Button, Chip, Icon } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import {
  LOCKED_SECTION,
  REPORT_PRESETS,
  applyPreset,
  canMoveSection,
  moveSection,
  presetOf,
  sameSections,
  toggleSection,
  type Paper,
  type ReportTemplate,
  type SectionState,
} from '../../../services/reports/reportTemplates.js';
import { ReportPaperPreview } from './ReportPaperPreview.js';

export interface ReportTemplateDrawerProps {
  template: ReportTemplate;
  /** The report's sections as saved. */
  saved: SectionState[];
  station: any;
  paper: Paper;
  showLogo: boolean;
  onClose: () => void;
  /** Persist the edited sections. Resolves once saved; the drawer then shows them as saved. */
  onSave: (sections: SectionState[]) => Promise<void>;
}

/**
 * Customize one report's layout (#332): pick a preset, then switch sections
 * on or off and move them with ↑/↓, with the page preview beside the list.
 * Hovering a row outlines its section on the page and the other way round.
 * The letterhead always prints first. Closing with unsaved edits asks first.
 */
export const ReportTemplateDrawer: React.FC<ReportTemplateDrawerProps> = ({
  template,
  saved,
  station,
  paper,
  showLogo,
  onClose,
  onSave,
}) => {
  const confirm = useConfirm();
  const [baseline, setBaseline] = useState(saved);
  const [sections, setSections] = useState(saved);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = !sameSections(sections, baseline);
  const preset = presetOf(template, sections);

  const requestClose = async () => {
    if (
      dirty &&
      !(await confirm({
        title: 'Discard unsaved changes?',
        message: `Your changes to the ${template.name} layout have not been saved.`,
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      }))
    ) {
      return;
    }
    onClose();
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(sections);
      setBaseline(sections);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      isOpen
      title={template.name}
      widthVariant="xwide"
      onClose={() => void requestClose()}
      footer={
        <div className="flex w-full items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSections(applyPreset(template, 'full'))}
          >
            Reset to default
          </Button>
          <span className="flex-1" />
          {dirty ? (
            <Chip tone="warning" dot>
              Unsaved changes
            </Chip>
          ) : null}
          <Button variant="primary" size="sm" disabled={!dirty} loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-ink-muted">{template.when}</p>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <SubHeading>Start from</SubHeading>
              <div role="radiogroup" aria-label="Preset" className="grid grid-cols-3 gap-2">
                {REPORT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={preset === p.id}
                    onClick={() => setSections(applyPreset(template, p.id))}
                    className={cn(
                      'flex flex-col rounded-input border px-2.5 py-2 text-left transition-colors',
                      preset === p.id
                        ? 'border-brand bg-brand/10'
                        : 'border-border-soft bg-surface hover:bg-surface-alt',
                    )}
                  >
                    <span className="text-[12px] font-semibold text-ink-strong">{p.name}</span>
                    <span className="text-[11px] text-ink-muted">{p.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SubHeading>Sections</SubHeading>
              <ul className="overflow-hidden rounded-card border border-border-soft">
                {sections.map((s) => (
                  <SectionRow
                    key={s.key}
                    template={template}
                    section={s}
                    highlighted={highlighted === s.key}
                    onHighlight={setHighlighted}
                    canMoveUp={canMoveSection(sections, s.key, -1)}
                    canMoveDown={canMoveSection(sections, s.key, 1)}
                    onToggle={() => setSections(toggleSection(sections, s.key))}
                    onMove={(delta) => setSections(moveSection(sections, s.key, delta))}
                  />
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:sticky lg:top-0">
            <SubHeading>Preview · {paper === 'LETTER' ? 'Letter' : 'A4'}</SubHeading>
            <ReportPaperPreview
              template={template}
              sections={sections}
              station={station}
              paper={paper}
              showLogo={showLogo}
              highlighted={highlighted}
              onHighlight={setHighlighted}
            />
          </div>
        </div>
      </div>
    </Drawer>
  );
};

const SubHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
    {children}
  </span>
);

const SectionRow: React.FC<{
  template: ReportTemplate;
  section: SectionState;
  highlighted: boolean;
  onHighlight: (key: string | null) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
}> = ({
  template,
  section,
  highlighted,
  onHighlight,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
}) => {
  const locked = section.key === LOCKED_SECTION;
  const label = template.labels[section.key] ?? section.key;
  return (
    <li
      data-row={section.key}
      onMouseEnter={() => onHighlight(section.key)}
      onMouseLeave={() => onHighlight(null)}
      className={cn(
        'flex items-center gap-2 border-b border-border-soft px-3 py-2 last:border-b-0',
        highlighted && 'bg-brand/10',
      )}
    >
      <Switch
        className="min-w-0 flex-1"
        checked={section.enabled}
        disabled={locked}
        onChange={onToggle}
        aria-label={label}
        label={
          <span className={cn(!section.enabled && 'text-ink-faint')}>
            {label}
            {locked ? (
              <Chip size="xs" className="ml-2" title="The letterhead always prints first">
                Always
              </Chip>
            ) : null}
          </span>
        }
        description={template.descriptions[section.key]}
      />
      {locked ? null : (
        <span className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            aria-label={`Move ${label} up`}
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          >
            <Icon name="arrow-up" size="xs" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            aria-label={`Move ${label} down`}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            <Icon name="arrow-down" size="xs" />
          </Button>
        </span>
      )}
    </li>
  );
};
