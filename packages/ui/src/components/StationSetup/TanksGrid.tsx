import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudTankService } from '../../services/cloud.js';
import { queryKeys, useProducts, useTanks } from '../../query/hooks.js';
import { Tank, Product } from '@pump/shared';
import {
  Button,
  Chip,
  ConceptIcon,
  DataSection,
  EmptyState,
  Form,
  InteractiveTable,
  SectionHeader,
  type TableColumn,
} from '../../pump-ds/index.js';
import { Field, NumberInput, Select, TextInput } from '../primitives/Field.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { Drawer } from '../Drawer.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useRunTask } from '../../utils/runTask.js';
import { useKeyedSaves } from './useKeyedSaves.js';
import { useCreateRequest, type CreateRequestProps } from './useCreateRequest.js';

const tankService = new CloudTankService();

export interface TanksGridProps extends CreateRequestProps {
  stationId: string;
}

export const TanksGrid: React.FC<TanksGridProps> = ({
  stationId,
  createRequest,
  onCreateHandled,
}) => {
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  const { save, renew } = useKeyedSaves();
  // Shared hooks instead of a loader copying into local state behind an effect.
  const tanksQ = useTanks(stationId);
  const productsQ = useProducts();
  const tanks: Tank[] = (tanksQ.data as Tank[]) ?? [];
  const fuelProducts: Product[] = ((productsQ.data as Product[]) ?? []).filter(
    (p) => p.productType === 'FUEL' && p.isActive,
  );
  const productOf = (t: Tank) => fuelProducts.find((p) => p.id === t.productId);
  const refreshTanks = () => qc.invalidateQueries({ queryKey: queryKeys.tanks(stationId ?? '') });
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form states
  const [nameRaw, setName] = useState('');
  const [productIdRaw, setProductId] = useState('');

  // The loader used to seed these with setState once the lists arrived. Derived
  // during render instead: the operator's choice wins, otherwise the first fuel
  // product and the next tank number. Same defaults, no cascading render, and
  // they stay right if the lists change underneath.
  const productId = productIdRaw || fuelProducts[0]?.id || '';
  const name = nameRaw || `Tank ${tanks.length + 1}`;
  const [capacity, setCapacity] = useState(20000);

  // Quick add states
  const [quickPetrolCapacity, setQuickPetrolCapacity] = useState('15000');
  const [quickDieselCapacity, setQuickDieselCapacity] = useState('20000');
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      toast.error('Please define a fuel product in the catalog first.');
      return;
    }
    try {
      const body = { stationId, name, productId, capacity };
      await save(`setup:tank:create:${stationId}`, body, (idempotencyKey) =>
        tankService.createTank(body, { idempotencyKey }),
      );
      setIsFormOpen(false);
      resetForm();
      runTask(refreshTanks(), 'Saved, but the tank list could not be refreshed.');
      toast.success('Tank created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tank');
    }
  };

  const handleQuickAdd = async (fuelCode: 'MS' | 'HSD', capStr: string) => {
    const fuel = fuelProducts.find((p) => p.code === fuelCode);
    if (!fuel) {
      toast.error(
        `Please define active ${fuelCode === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'} in the catalog first.`,
      );
      return;
    }
    const cap = parseInt(capStr);
    if (!cap || cap <= 0) {
      toast.error('Please enter a valid capacity');
      return;
    }

    try {
      setQuickSubmitting(true);
      const sameProductTanksCount = tanks.filter((t) => t.productId === fuel.id).length;
      const tankName =
        fuelCode === 'MS'
          ? `Petrol Tank ${sameProductTanksCount + 1}`
          : `Diesel Tank ${sameProductTanksCount + 1}`;

      const body = { stationId, name: tankName, productId: fuel.id, capacity: cap };
      // Its own scope per fuel, so a Petrol quick add left unanswered never
      // lends its key to a Diesel one.
      await save(`setup:tank:create:${stationId}:quick-${fuelCode}`, body, (idempotencyKey) =>
        tankService.createTank(body, { idempotencyKey }),
      );

      runTask(refreshTanks(), 'Saved, but the tank list could not be refreshed.');
      toast.success('Tank created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tank');
    } finally {
      setQuickSubmitting(false);
    }
  };

  const prefillSuggestion = (fuelCode: 'MS' | 'HSD') => {
    const fuel = fuelProducts.find((p) => p.code === fuelCode);
    if (!fuel) {
      toast.error(
        `Please define active ${fuelCode === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'} in step 2 first.`,
      );
      return;
    }

    setName(fuelCode === 'MS' ? 'Petrol Tank 1' : 'Diesel Tank 1');
    setCapacity(fuelCode === 'MS' ? 15000 : 20000);
    setProductId(fuel.id);
    renew();
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setName(`Tank ${tanks.length + 1}`);
    if (fuelProducts.length > 0) {
      setProductId(fuelProducts[0].id);
    }
    setCapacity(20000);
  };

  const columns: TableColumn<Tank>[] = [
    { id: 'name', header: 'Tank', kind: 'text', value: (t) => t.name, emphasis: true },
    {
      id: 'product',
      header: 'Fuel',
      kind: 'text',
      value: (t) => productOf(t)?.name ?? 'Unknown',
      cell: (t) => (
        <Chip tone="neutral" size="md">
          {productOf(t)?.name || 'Unknown'}
        </Chip>
      ),
    },
    {
      id: 'capacity',
      header: 'Capacity',
      kind: 'qty',
      value: (t) => t.capacity,
      unit: (t) => productOf(t)?.unit || 'L',
      total: false,
    },
  ];

  const closeForm = () => {
    resetForm();
    setIsFormOpen(false);
  };

  const openCreate = () => {
    resetForm();
    renew();
    setIsFormOpen(true);
  };
  // The Station page's Add ▾ menu opens this drawer.
  useCreateRequest(createRequest, openCreate, onCreateHandled);

  const quickAdd = (code: 'MS' | 'HSD', label: string, value: string, set: (v: string) => void) =>
    fuelProducts.some((p) => p.code === code) && (
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-ink-strong">{label}</span>
        <NumberInput
          className="w-[110px]"
          placeholder="Capacity"
          aria-label={`${label} capacity`}
          value={value}
          onChange={(e) => set(e.target.value)}
          disabled={quickSubmitting}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={quickSubmitting}
          onClick={() => runTask(handleQuickAdd(code, value), 'Could not add the tank.')}
        >
          Quick Add
        </Button>
      </div>
    );

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Storage tanks"
        subtitle={tanksQ.data ? countOf(tanks.length, 'tank', 'tanks') : undefined}
      />

      {fuelProducts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-border-soft bg-surface-alt px-4 py-3">
          <span className="text-[12px] text-ink-muted">Quick add a tank by capacity:</span>
          {quickAdd('MS', 'Petrol Tank (MS)', quickPetrolCapacity, setQuickPetrolCapacity)}
          {quickAdd('HSD', 'Diesel Tank (HSD)', quickDieselCapacity, setQuickDieselCapacity)}
        </div>
      )}

      <DataSection
        title="storage tanks"
        query={[tanksQ, productsQ]}
        placeholderHeight={160}
        flush
        isEmpty={tanks.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<ConceptIcon concept="tanks" size="md" />}
              title="No storage tanks"
              description="Add the underground tanks at this station to link nozzles to them."
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={columns}
          rows={tanks}
          rowKey={(t) => t.id}
          title="storage tanks"
        />
      </DataSection>

      <Drawer isOpen={isFormOpen} onClose={closeForm} title="Add Storage Tank">
        <Form onSubmit={handleCreate} className="flex flex-col">
          <Field label="Tank Identifier" required>
            <TextInput
              placeholder="e.g. Tank 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Linked Fuel Product" required>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {fuelProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`Capacity (${fuelProducts.find((p) => p.id === productId)?.unit || 'L'})`}
            required
          >
            <NumberInput
              value={capacity}
              onChange={(e) => setCapacity(parseInt(e.target.value) || 0)}
              placeholder="e.g. 15000"
              required
            />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" className="flex-1">
              Create Tank
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
