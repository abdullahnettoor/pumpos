import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudDispenserService, CloudNozzleService } from '../../services/cloud.js';
import { queryKeys, useDispensers, useNozzles, useProducts, useTanks } from '../../query/hooks.js';
import { DispenserUnit, Tank, Product, Nozzle } from '@pump/shared';
import { Drawer } from '../Drawer.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { useInvalidateOperational } from '../../query/hooks.js';
import {
  officeSubmitKeys,
  sendKeyed,
  type SubmitKeySession,
} from '../../office-records/submitKeys.js';
import { useCreateRequest, type CreateRequestProps } from './useCreateRequest.js';
import {
  Button,
  Chip,
  ConceptIcon,
  DataSection,
  EmptyState,
  Form,
  Icon,
  SectionHeader,
  StatusChip,
} from '../../pump-ds/index.js';
import { Field, NumberInput, Select, TextInput } from '../primitives/Field.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { formatQuantity } from '../../utils/format.js';

const dispenserService = new CloudDispenserService();
const nozzleService = new CloudNozzleService();

export interface DispensersListProps extends CreateRequestProps {
  stationId: string;
}

interface NozzleInput {
  name: string;
  productId: string;
  tankId: string;
  currentReading: number;
}

export const DispensersList: React.FC<DispensersListProps> = ({
  stationId,
  createRequest,
  onCreateHandled,
}) => {
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  // One session per opened edit (#537): a new edit never inherits an unsettled key.
  const sessionRef = useRef<SubmitKeySession | null>(null);
  const invalidateOperational = useInvalidateOperational();
  // Shared hooks rather than a loader copying four lists into local state.
  const dispensersQ = useDispensers(stationId);
  const tanksQ = useTanks(stationId);
  const productsQ = useProducts();
  const nozzlesQ = useNozzles(stationId);

  const dispensers: DispenserUnit[] = (dispensersQ.data as DispenserUnit[]) ?? [];
  const tanks: Tank[] = (tanksQ.data as Tank[]) ?? [];
  const nozzles: Nozzle[] = (nozzlesQ.data as Nozzle[]) ?? [];
  const products: Product[] = ((productsQ.data as Product[]) ?? []).filter(
    (p) => p.productType === 'FUEL' && p.isActive,
  );
  const refreshDispensers = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.dispensers(stationId ?? '') }),
      qc.invalidateQueries({ queryKey: queryKeys.nozzles(stationId ?? '') }),
    ]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCodeEdited, setIsCodeEdited] = useState(false);
  /** Dispenser whose status is being changed; blocks a double-flip. */
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [nameRaw, setName] = useState('');
  const [codeRaw, setCode] = useState('');

  // Seeded by the loader's setState before; derived during render now, so the
  // next unit number stays correct as the list changes.
  const name = nameRaw || `Dispenser Unit ${dispensers.length + 1}`;
  const code = codeRaw || `DU-${String(dispensers.length + 1).padStart(2, '0')}`;
  const [nozzlesList, setNozzlesList] = useState<NozzleInput[]>([]);

  const resetForm = () => {
    setName(`Dispenser Unit ${dispensers.length + 1}`);
    setCode(`DU-${String(dispensers.length + 1).padStart(2, '0')}`);
    setNozzlesList([]);
    setIsCodeEdited(false);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isCodeEdited) {
      setCode(
        val
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 10),
      );
    }
  };

  const addNozzleRow = () => {
    const defaultProduct = products[0]?.id || '';
    const defaultTank = tanks.find((t) => t.productId === defaultProduct)?.id || '';
    const nextNozzleNum = nozzles.length + nozzlesList.length + 1;
    setNozzlesList((prev) => [
      ...prev,
      {
        name: `N${nextNozzleNum}`,
        productId: defaultProduct,
        tankId: defaultTank,
        currentReading: 1000,
      },
    ]);
  };

  const removeNozzleRow = (idx: number) => {
    setNozzlesList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleNozzleProductChange = (idx: number, prodId: string) => {
    const defaultTank = tanks.find((t) => t.productId === prodId)?.id || '';
    setNozzlesList((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return { ...item, productId: prodId, tankId: defaultTank };
      }),
    );
  };

  const handleNozzleTankChange = (idx: number, tankId: string) => {
    setNozzlesList((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return { ...item, tankId };
      }),
    );
  };

  const handleNozzleNameChange = (idx: number, nozzleName: string) => {
    setNozzlesList((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return { ...item, name: nozzleName };
      }),
    );
  };

  const handleNozzleReadingChange = (idx: number, reading: number) => {
    setNozzlesList((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return { ...item, currentReading: reading };
      }),
    );
  };

  /**
   * Flip a dispenser between in and out of service.
   *
   * Sends only `status`. The update command accepts name and code too, and
   * echoing the current ones back would turn a maintenance flip into a rename
   * race against anyone editing the dispenser concurrently.
   */
  const handleStatusToggle = async (du: DispenserUnit) => {
    if (statusBusyId) return;
    const next = du.status === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE';
    try {
      setStatusBusyId(du.id);
      const body = { status: next };
      await sendKeyed(
        officeSubmitKeys.session(`setup:dispensers:${du.id}`),
        body,
        (idempotencyKey) => dispenserService.updateDispenser(du.id, body, { idempotencyKey }),
      );
      toast.success(
        next === 'MAINTENANCE' ? `${du.name} is out of service.` : `${du.name} is back in service.`,
      );
    } catch (err: any) {
      toast.error(
        withNextStep(
          err?.message || "Couldn't change the dispenser status",
          'Try again from its row.',
        ),
      );
      return;
    } finally {
      setStatusBusyId(null);
    }
    // Refreshes run after the toast and outside the try: the status HAS
    // changed by now, so a failed refresh must not be reported as a failed
    // change. Same shape as `handleCreate` below.
    runTask(refreshDispensers(), 'Status saved, but the dispenser list could not be refreshed.');
    // Shift status is a separate, operational cache (15s) that now derives
    // from dispenser status — whether a pump is offered at shift open, and
    // whether its nozzles are read. Without this the shifts screen keeps
    // offering a pump that was just taken out of service.
    runTask(invalidateOperational(), 'Status saved, but the shifts screen may be out of date.');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      // Create Dispenser
      const duBody = { stationId, name, code: code.toUpperCase(), status: 'ACTIVE' };
      const createdDU = await sendKeyed(
        sessionRef.current ?? officeSubmitKeys.session(`setup:dispensers:${stationId}`),
        duBody,
        (idempotencyKey) => dispenserService.createDispenser(duBody, { idempotencyKey }),
      );

      // Sequential nozzle creations for SQLite resilience. Each nozzle is its
      // own request, so its own scope: a key is never shared between rows.
      for (const [idx, nozzleInput] of nozzlesList.entries()) {
        if (!nozzleInput.tankId || !nozzleInput.productId) {
          throw new Error('Please make sure all nozzles have a valid tank and product selected.');
        }
        const nozzleBody = {
          stationId,
          duId: createdDU.id,
          tankId: nozzleInput.tankId,
          productId: nozzleInput.productId,
          name: nozzleInput.name,
          currentReading: nozzleInput.currentReading,
        };
        await sendKeyed(
          officeSubmitKeys.session(`setup:nozzles:${createdDU.id}:${idx}`),
          nozzleBody,
          (idempotencyKey) => nozzleService.createNozzle(nozzleBody, { idempotencyKey }),
        );
      }

      setIsFormOpen(false);
      resetForm();
      runTask(refreshDispensers(), 'Saved, but the dispenser list could not be refreshed.');
      toast.success('Dispenser unit created.');
    } catch (err: any) {
      toast.error(
        withNextStep(
          err.message || "Couldn't create the dispenser unit and nozzles",
          'Check the details and save again.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const prefillDualNozzles = () => {
    const petrol = products.find((p) => p.code === 'MS');
    const diesel = products.find((p) => p.code === 'HSD');
    const petrolTank = tanks.find((t) => t.productId === petrol?.id);
    const dieselTank = tanks.find((t) => t.productId === diesel?.id);

    setName(`Dispenser Unit ${dispensers.length + 1}`);
    setCode(`DU-${String(dispensers.length + 1).padStart(2, '0')}`);

    const baseNozzleNum = nozzles.length + 1;
    const recommendedNozzles: NozzleInput[] = [];

    if (petrol && petrolTank) {
      recommendedNozzles.push({
        name: `N${baseNozzleNum}`,
        productId: petrol.id,
        tankId: petrolTank.id,
        currentReading: 1000,
      });
    }
    if (diesel && dieselTank) {
      recommendedNozzles.push({
        name: `N${baseNozzleNum + recommendedNozzles.length}`,
        productId: diesel.id,
        tankId: dieselTank.id,
        currentReading: 1000,
      });
    }

    setNozzlesList(recommendedNozzles);
    sessionRef.current = officeSubmitKeys.session(`setup:dispensers:${stationId}`);
    setIsFormOpen(true);
  };

  const prefillQuadNozzles = () => {
    const petrol = products.find((p) => p.code === 'MS');
    const diesel = products.find((p) => p.code === 'HSD');
    const petrolTank = tanks.find((t) => t.productId === petrol?.id);
    const dieselTank = tanks.find((t) => t.productId === diesel?.id);

    setName(`Dispenser Unit ${dispensers.length + 1}`);
    setCode(`DU-${String(dispensers.length + 1).padStart(2, '0')}`);

    const baseNozzleNum = nozzles.length + 1;
    const recommendedNozzles: NozzleInput[] = [];

    if (petrol && petrolTank) {
      recommendedNozzles.push({
        name: `N${baseNozzleNum}`,
        productId: petrol.id,
        tankId: petrolTank.id,
        currentReading: 1000,
      });
      recommendedNozzles.push({
        name: `N${baseNozzleNum + 1}`,
        productId: petrol.id,
        tankId: petrolTank.id,
        currentReading: 1000,
      });
    }
    if (diesel && dieselTank) {
      const currentLen = recommendedNozzles.length;
      recommendedNozzles.push({
        name: `N${baseNozzleNum + currentLen}`,
        productId: diesel.id,
        tankId: dieselTank.id,
        currentReading: 1000,
      });
      recommendedNozzles.push({
        name: `N${baseNozzleNum + currentLen + 1}`,
        productId: diesel.id,
        tankId: dieselTank.id,
        currentReading: 1000,
      });
    }

    setNozzlesList(recommendedNozzles);
    sessionRef.current = officeSubmitKeys.session(`setup:dispensers:${stationId}`);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    resetForm();
    setIsFormOpen(false);
  };

  const openCreate = () => {
    resetForm();
    sessionRef.current = officeSubmitKeys.session(`setup:dispensers:${stationId}`);
    setIsFormOpen(true);
  };
  // The Station page's Add ▾ menu opens this drawer.
  useCreateRequest(createRequest, openCreate, onCreateHandled);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Dispenser units"
        subtitle={
          dispensersQ.data ? countOf(dispensers.length, 'dispenser', 'dispensers') : undefined
        }
      />

      {products.length > 0 && tanks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-soft bg-surface-alt px-4 py-3">
          <span className="text-[12px] text-ink-muted">
            Pre-fill the form with a standard dispenser layout:
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={prefillDualNozzles}>
              Auto-fill Dual Dispenser (2 Nozzles)
            </Button>
            <Button size="sm" variant="secondary" onClick={prefillQuadNozzles}>
              Auto-fill Quad Dispenser (4 Nozzles)
            </Button>
          </div>
        </div>
      )}

      <DataSection
        title="dispenser units"
        query={[dispensersQ, tanksQ, productsQ, nozzlesQ]}
        placeholderHeight={200}
        isEmpty={dispensers.length === 0}
        empty={
          <EmptyState
            compact
            icon={<ConceptIcon concept="dispensers" size="md" />}
            title="No dispenser units"
            description="Add the pumps at this station and map their nozzles to tanks."
          />
        }
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {dispensers.map((du) => {
            const duNozzles = nozzles.filter((n) => n.duId === du.id);
            return (
              <div
                key={du.id}
                data-dispenser={du.id}
                className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] font-semibold text-ink-strong">
                      {du.name}
                    </span>
                    <span className="font-mono text-[12px] text-ink-muted">{du.code}</span>
                  </div>
                  {/* Maintenance is a warning, not a fault: the pump is
                      expected back. Only INACTIVE is retired. */}
                  {du.status === 'MAINTENANCE' ? (
                    <Chip tone="warning" size="md">
                      Maintenance
                    </Chip>
                  ) : (
                    <StatusChip status={du.status === 'ACTIVE' ? 'active' : 'inactive'} size="md" />
                  )}
                </div>

                <div className="flex flex-col gap-1.5 border-t border-border-soft pt-2.5">
                  <span className="text-[12px] font-semibold text-ink-muted">Nozzles</span>
                  {duNozzles.length > 0 ? (
                    duNozzles.map((n) => {
                      const prod = products.find((p) => p.id === n.productId);
                      const tank = tanks.find((t) => t.id === n.tankId);
                      return (
                        <div key={n.id} className="flex justify-between gap-2 text-[12px] text-ink">
                          <span className="font-medium">
                            {n.name} →{' '}
                            <span className="text-ink-muted">
                              {tank?.name || 'No Tank'} ({prod?.name || 'No Fuel'})
                            </span>
                          </span>
                          <span className="font-mono font-semibold text-ink-strong">
                            {formatQuantity(n.currentReading, prod?.unit || 'L', { decimals: 3 })}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[12px] text-ink-muted">
                      No nozzles connected to this dispenser.
                    </p>
                  )}
                </div>

                {/* Taking a pump out of service. The consequences are not
                    obvious from the word "maintenance", so they are spelled
                    out: it stops being offered at shift open, which is what
                    lets a shift open at all while it is broken (#258). */}
                <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-2.5">
                  <span className="text-[12px] text-ink-muted">
                    {du.status === 'ACTIVE'
                      ? 'In service'
                      : du.status === 'MAINTENANCE'
                        ? 'Out of service — not offered at shift open, and its nozzles are not read'
                        : 'Retired'}
                  </span>
                  {/* Only ACTIVE ⇄ MAINTENANCE. A retired dispenser is not the
                      same as one under repair, and a two-state toggle over a
                      three-state enum would silently un-retire it. */}
                  {du.status !== 'INACTIVE' && (
                    <Button
                      variant="secondary"
                      size="xs"
                      loading={statusBusyId === du.id}
                      disabled={!!statusBusyId && statusBusyId !== du.id}
                      onClick={() => handleStatusToggle(du)}
                    >
                      {du.status === 'ACTIVE' ? 'Put into maintenance' : 'Return to service'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DataSection>

      <Drawer isOpen={isFormOpen} onClose={closeForm} title="Add Dispenser Island">
        <Form onSubmit={handleCreate} className="flex flex-col">
          <Field label="Dispenser Name" required>
            <TextInput
              placeholder="e.g. Dispenser 01"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </Field>
          <Field label="Code / Reference ID" required>
            <TextInput
              placeholder="e.g. DU-01"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setIsCodeEdited(true);
              }}
              required
            />
          </Field>

          <div className="flex flex-col gap-3 border-t border-border-soft pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-strong">Map Nozzles</span>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                leftIcon={<Icon name="plus" size="xs" />}
                onClick={addNozzleRow}
              >
                Add Nozzle
              </Button>
            </div>

            {nozzlesList.length > 0 ? (
              nozzlesList.map((nozzle, idx) => {
                const filteredTanks = tanks.filter((t) => t.productId === nozzle.productId);
                return (
                  <div
                    key={idx}
                    className="flex flex-col rounded-card border border-border-soft bg-surface-alt p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-ink-muted">
                        Nozzle #{idx + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => removeNozzleRow(idx)}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2">
                      <Field label="Name">
                        <TextInput
                          value={nozzle.name}
                          onChange={(e) => handleNozzleNameChange(idx, e.target.value)}
                          required
                        />
                      </Field>
                      <Field
                        label={`Reading (${products.find((p) => p.id === nozzle.productId)?.unit || 'L'})`}
                      >
                        <NumberInput
                          value={nozzle.currentReading || ''}
                          onChange={(e) =>
                            handleNozzleReadingChange(idx, parseFloat(e.target.value) || 0)
                          }
                          required
                        />
                      </Field>
                      <Field label="Fuel">
                        <Select
                          value={nozzle.productId}
                          onChange={(e) => handleNozzleProductChange(idx, e.target.value)}
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Tank">
                        <Select
                          value={nozzle.tankId}
                          onChange={(e) => handleNozzleTankChange(idx, e.target.value)}
                        >
                          <option value="">-- Select Tank --</option>
                          {filteredTanks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="p-3 text-center text-[12px] text-ink-muted">
                No nozzles mapped yet. Click "Add Nozzle" to connect fuel lines to this dispenser.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-3">
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={submitting}
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Dispenser'}
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </Form>
      </Drawer>
    </section>
  );
};
