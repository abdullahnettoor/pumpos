import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudShiftTemplateService } from '../../services/cloud.js';
import { ShiftTemplate } from '@pump/shared';
import {
  Button,
  ConceptIcon,
  DataSection,
  EmptyState,
  Form,
  InteractiveTable,
  SectionHeader,
  type TableColumn,
} from '../../pump-ds/index.js';
import { Drawer } from '../Drawer.js';
import { Field, TextInput } from '../primitives/Field.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { queryKeys, useShiftTemplates } from '../../query/hooks.js';
import { countOf } from '../../utils/ledgerWindow.js';

const templateService = new CloudShiftTemplateService();

const columns: TableColumn<ShiftTemplate>[] = [
  {
    id: 'name',
    header: 'Shift',
    kind: 'text',
    value: (t) => t.name,
    cell: (t) => <span className="font-medium text-ink-strong">{t.name}</span>,
  },
  {
    id: 'hours',
    header: 'Operating hours',
    kind: 'text',
    value: (t) => `${t.startTime} - ${t.endTime}`,
    cell: (t) => (
      <span className="font-mono tabular-nums">
        {t.startTime} - {t.endTime}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'status',
    value: (t) => (t.isActive ? 'active' : 'inactive'),
  },
];

export const ShiftTemplates: React.FC = () => {
  const toast = useToast();
  const runTask = useRunTask();
  const qc = useQueryClient();
  const templatesQ = useShiftTemplates();
  const templates: ShiftTemplate[] = templatesQ.data ?? [];
  const [prefilling, setPrefilling] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('14:00');

  const loadTemplates = () => qc.invalidateQueries({ queryKey: queryKeys.shiftTemplates() });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await templateService.createTemplate({
        name,
        startTime,
        endTime,
        isActive: true,
      });
      setIsFormOpen(false);
      runTask(loadTemplates(), 'Saved, but the template list could not be refreshed.');
      toast.success('Shift template created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create shift template');
    }
  };

  const prefillDefaultShifts = async () => {
    try {
      setPrefilling(true);
      await templateService.createTemplate({
        name: 'Morning Shift',
        startTime: '06:00',
        endTime: '14:00',
        isActive: true,
      });
      await templateService.createTemplate({
        name: 'Evening Shift',
        startTime: '14:00',
        endTime: '22:00',
        isActive: true,
      });
      await templateService.createTemplate({
        name: 'Night Shift',
        startTime: '22:00',
        endTime: '06:00',
        isActive: true,
      });
      runTask(loadTemplates(), 'Saved, but the template list could not be refreshed.');
      toast.success('Default shifts created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to pre-fill default shifts');
    } finally {
      setPrefilling(false);
    }
  };

  const resetForm = () => {
    setName(`Shift ${templates.length + 1}`);
    if (templates.length === 0) {
      setStartTime('06:00');
      setEndTime('14:00');
    } else if (templates.length === 1) {
      setStartTime('14:00');
      setEndTime('22:00');
    } else if (templates.length === 2) {
      setStartTime('22:00');
      setEndTime('06:00');
    } else {
      setStartTime('08:00');
      setEndTime('16:00');
    }
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Shift schedules"
        subtitle={templatesQ.data ? countOf(templates.length, 'shift', 'shifts') : undefined}
        action={isFormOpen ? undefined : { label: 'Add shift', onClick: openCreate }}
      />
      <p className="px-0.5 text-[12px] text-ink-muted">
        Configure standard timing templates for station operators.
      </p>
      <DataSection
        title="shift templates"
        query={templatesQ}
        placeholderHeight={160}
        flush
        isEmpty={templates.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<ConceptIcon concept="shift-templates" size="md" />}
              title="No shift timing templates configured"
              description="Create standard 8-hour operational shifts with a single click: Morning (06:00 - 14:00), Evening (14:00 - 22:00), and Night (22:00 - 06:00)."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  disabled={prefilling}
                  onClick={() =>
                    runTask(prefillDefaultShifts(), 'Could not add the default shifts.')
                  }
                >
                  Pre-fill Default Shifts
                </Button>
              }
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={columns}
          rows={templates}
          rowKey={(r) => r.id}
          title="shift templates"
        />
      </DataSection>

      <Drawer
        isOpen={isFormOpen}
        onClose={() => {
          resetForm();
          setIsFormOpen(false);
        }}
        title="Add Shift Template"
      >
        <Form onSubmit={handleCreate} className="flex flex-col">
          <Field label="Shift Name" required>
            <TextInput
              type="text"
              placeholder="e.g. Morning Shift"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Start Time" required>
            <TextInput
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </Field>
          <Field label="End Time" required>
            <TextInput
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border-soft pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Shift
            </Button>
          </div>
        </Form>
      </Drawer>
    </section>
  );
};
