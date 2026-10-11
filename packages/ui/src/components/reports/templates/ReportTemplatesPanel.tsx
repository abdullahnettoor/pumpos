import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ATTENDANT_REPORT_CAPABILITY } from '@pump/shared';
import { CloudStationService } from '../../../services/cloud.js';
import { queryKeys } from '../../../query/hooks.js';
import { useCapability } from '../../../access/CapabilityGate.js';
import { useToast } from '../../primitives/ToastProvider.js';
import { Switch } from '../../primitives/Toggle.js';
import { Button, Chip, Panel, SegmentedControl } from '../../../pump-ds/index.js';
import { paperFromStation } from '../../../services/reports/reportConfig.js';
import { showLogoFromStation } from '../../../services/reports/letterhead.js';
import {
  REPORT_TEMPLATES,
  enabledCount,
  presetLabel,
  presetOf,
  reportConfigSettings,
  sectionsFromStation,
  type Paper,
  type ReportConfigChange,
  type ReportTemplate,
  type ReportTemplateId,
} from '../../../services/reports/reportTemplates.js';
import { ReportPaperPreview } from './ReportPaperPreview.js';
import { ReportTemplateDrawer } from './ReportTemplateDrawer.js';

const stationService = new CloudStationService();

export interface ReportTemplatesPanelProps {
  selectedStation: any;
}

/**
 * Reports → Templates (#332): one card per printed report with a live
 * thumbnail of its layout, and a Customize drawer to change it. Paper size and
 * the letterhead logo apply to every report and save as soon as they change.
 * The letterhead content itself (name, address, GSTIN, logo) is edited in
 * Station Overview → Business & Branding.
 */
export const ReportTemplatesPanel: React.FC<ReportTemplatesPanelProps> = ({ selectedStation }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<ReportTemplateId | null>(null);
  const [savingPage, setSavingPage] = useState(false);
  // The Attendant Handover Report is gated: an Organization without it is not
  // offered a template for a report it cannot open.
  const attendantReport = useCapability(ATTENDANT_REPORT_CAPABILITY);
  const templates = REPORT_TEMPLATES.filter(
    (t) => t.id !== 'attendantReport' || attendantReport.status === 'enabled',
  );

  const paper = paperFromStation(selectedStation);
  const showLogo = showLogoFromStation(selectedStation);

  const save = async (change: ReportConfigChange, success: string) => {
    try {
      await stationService.updateStation(selectedStation.id, {
        settings: reportConfigSettings(selectedStation, change),
      });
      await qc.invalidateQueries({ queryKey: queryKeys.stations() });
      toast.success(success);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the report template.');
      throw err;
    }
  };

  const savePage = async (change: ReportConfigChange) => {
    setSavingPage(true);
    try {
      await save(change, 'Report page settings saved.');
    } catch {
      // Already reported by `save`.
    } finally {
      setSavingPage(false);
    }
  };

  const editingTemplate = templates.find((t) => t.id === editing);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2">
          <span className="text-[12px] text-ink-muted">Paper for all reports</span>
          <SegmentedControl<Paper>
            aria-label="Paper size"
            // Each choice saves, so the arrows only browse; Enter / Space / click
            // chooses. Not `disabled` while saving (that would drop the focus).
            activation="manual"
            value={paper}
            onChange={(next) => {
              if (!savingPage) void savePage({ paper: next });
            }}
            options={[
              { value: 'A4', label: 'A4' },
              { value: 'LETTER', label: 'Letter' },
            ]}
          />
        </span>
        <Switch
          label="Logo on letterhead"
          checked={showLogo}
          disabled={savingPage}
          onChange={(e) => savePage({ showLogo: e.target.checked })}
        />
        <span className="text-[12px] text-ink-faint">
          Letterhead details are edited in Station Overview → Business &amp; Branding.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            station={selectedStation}
            paper={paper}
            showLogo={showLogo}
            onCustomize={() => setEditing(template.id)}
          />
        ))}
      </div>

      {editingTemplate ? (
        <ReportTemplateDrawer
          key={editingTemplate.id}
          template={editingTemplate}
          saved={sectionsFromStation(editingTemplate, selectedStation)}
          station={selectedStation}
          paper={paper}
          showLogo={showLogo}
          onClose={() => setEditing(null)}
          onSave={(sections) =>
            save({ [editingTemplate.id]: sections }, `${editingTemplate.name} template saved.`)
          }
        />
      ) : null}
    </div>
  );
};

const TemplateCard: React.FC<{
  template: ReportTemplate;
  station: any;
  paper: Paper;
  showLogo: boolean;
  onCustomize: () => void;
}> = ({ template, station, paper, showLogo, onCustomize }) => {
  const sections = sectionsFromStation(template, station);
  const isPreset = presetOf(template, sections) !== null;
  return (
    <Panel data-testid={`template-card-${template.id}`}>
      {/* Panel wraps children in its own body, so the spacing lives here. */}
      <div className="flex flex-col gap-4">
        <ReportPaperPreview
          template={template}
          sections={sections}
          station={station}
          paper={paper}
          showLogo={showLogo}
          thumbnail
        />
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] font-semibold text-ink-strong">{template.name}</div>
          <div className="text-[12px] text-ink-muted">{template.when}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Chip size="xs">
            {enabledCount(sections)} of {sections.length} sections
          </Chip>
          <Chip size="xs" tone={isPreset ? 'brand' : 'neutral'}>
            {presetLabel(template, sections)}
          </Chip>
          <span className="flex-1" />
          <Button
            variant="secondary"
            size="xs"
            onClick={onCustomize}
            aria-label={`Customize ${template.name}`}
          >
            Customize
          </Button>
        </div>
      </div>
    </Panel>
  );
};
