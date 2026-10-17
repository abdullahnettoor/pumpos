import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import {
  CreateShiftTemplates,
  MAX_SHIFT_TEMPLATES_PER_REQUEST,
  type ShiftTemplate,
  type ShiftTemplateRepository,
} from './index.js';

class InMemoryTemplates implements ShiftTemplateRepository {
  readonly rows: ShiftTemplate[] = [];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(t: ShiftTemplate) {
    this.rows.push(t);
  }
  async deleteById() {
    return false;
  }
  async listByOrganization(organizationId: string) {
    return this.rows.filter((r) => r.organizationId === organizationId);
  }
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: null,
    businessDayId: null,
    actorId: 'user-1',
    correlationId: null,
    groupingRole: 'primary',
    clock: new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
    ids: new SequentialIdGenerator('tpl'),
  };
}

function setup() {
  const repository = new InMemoryTemplates();
  const store = new InMemoryEventStore();
  const useCase = new CreateShiftTemplates({
    repository,
    events: new InProcessEventDispatcher({ store }),
  });
  return { repository, store, useCase };
}

const THREE_SHIFTS = [
  { name: 'Morning Shift', startTime: '06:00', endTime: '14:00', isActive: true },
  { name: 'Evening Shift', startTime: '14:00', endTime: '22:00', isActive: true },
  { name: 'Night Shift', startTime: '22:00', endTime: '06:00', isActive: true },
];

describe('CreateShiftTemplates', () => {
  it('creates every template with one event each', async () => {
    const { repository, store, useCase } = setup();

    const result = await useCase.execute({ templates: THREE_SHIFTS }, makeContext());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((t) => t.name)).toEqual([
      'Morning Shift',
      'Evening Shift',
      'Night Shift',
    ]);
    expect(repository.rows).toEqual(result.data);
    expect(store.events.map((e) => e.eventType)).toEqual(
      THREE_SHIFTS.map(() => BusinessEvents.SHIFT_TEMPLATE_CREATED),
    );
  });

  it('writes nothing when any template is invalid', async () => {
    const { repository, store, useCase } = setup();

    const result = await useCase.execute(
      { templates: [THREE_SHIFTS[0], { ...THREE_SHIFTS[1], endTime: '25:00' }] },
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repository.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('refuses an empty or oversized batch', async () => {
    const { repository, useCase } = setup();

    const empty = await useCase.execute({ templates: [] }, makeContext());
    const oversized = await useCase.execute(
      {
        templates: Array.from(
          { length: MAX_SHIFT_TEMPLATES_PER_REQUEST + 1 },
          () => THREE_SHIFTS[0],
        ),
      },
      makeContext(),
    );

    expect(empty.success).toBe(false);
    expect(oversized.success).toBe(false);
    expect(repository.rows).toHaveLength(0);
  });
});
