import { describe, expect, it } from 'vite-plus/test';
import { BusinessEvents } from '../../../kernel/index.js';
import { CreateHead, UpdateHead } from './index.js';
import type { Head, HeadKind, HeadRepository } from './index.js';
import { eventBus, officeCtx } from '../__tests__/office.js';

class HeadRepo implements HeadRepository {
  constructor(readonly rows: Head[] = []) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async existsByName(organizationId: string, name: string, excludeId?: string) {
    return this.rows.some(
      (r) =>
        r.organizationId === organizationId &&
        r.id !== excludeId &&
        r.name.toLowerCase() === name.toLowerCase(),
    );
  }
  async save(head: Head) {
    const i = this.rows.findIndex((r) => r.id === head.id);
    if (i >= 0) this.rows[i] = head;
    else this.rows.push(head);
  }
}

const seeded = (over: Partial<Head> = {}): Head => ({
  id: 'h-1',
  organizationId: 'org-1',
  name: 'Generator Diesel',
  nature: 'DIRECT',
  isSystem: true,
  ...over,
});

const KINDS: HeadKind[] = ['expense', 'income'];

describe.each(KINDS)('CreateHead (%s)', (kind) => {
  it('defaults the Type to Indirect', async () => {
    const heads = new HeadRepo();
    const { events } = eventBus();
    const r = await new CreateHead(kind, { heads, events }).execute({ name: 'Tea' }, officeCtx());
    expect(r.success && r.data).toMatchObject({ name: 'Tea', nature: 'INDIRECT', isSystem: false });
    expect(heads.rows).toHaveLength(1);
  });

  it('accepts Direct and emits an event carrying the Type', async () => {
    const heads = new HeadRepo();
    const { store, events } = eventBus();
    const r = await new CreateHead(kind, { heads, events }).execute(
      { name: ' Diesel ', nature: 'DIRECT' },
      officeCtx(),
    );
    expect(r.success && r.data).toMatchObject({ name: 'Diesel', nature: 'DIRECT' });
    const [event] = store.events;
    expect(event.eventType).toBe(
      kind === 'expense'
        ? BusinessEvents.EXPENSE_CATEGORY_CREATED
        : BusinessEvents.INCOME_CATEGORY_CREATED,
    );
    expect(event.payload).toMatchObject({ kind, name: 'Diesel', nature: 'DIRECT' });
  });

  it('refuses an unknown Type and writes nothing', async () => {
    const heads = new HeadRepo();
    const { store, events } = eventBus();
    const r = await new CreateHead(kind, { heads, events }).execute(
      { name: 'Tea', nature: 'SOMETHING' },
      officeCtx(),
    );
    expect(!r.success && r.error.code).toBe('VALIDATION_ERROR');
    expect(heads.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('refuses a blank or over-long name', async () => {
    const run = (name: string) =>
      new CreateHead(kind, { heads: new HeadRepo(), events: eventBus().events }).execute(
        { name },
        officeCtx(),
      );
    expect((await run('  ')).success).toBe(false);
    expect((await run('x'.repeat(101))).success).toBe(false);
  });

  it('refuses a name already used, ignoring case', async () => {
    const heads = new HeadRepo([seeded()]);
    const r = await new CreateHead(kind, { heads, events: eventBus().events }).execute(
      { name: 'generator diesel' },
      officeCtx(),
    );
    expect(!r.success && r.error.code).toBe('CONFLICT');
  });
});

describe.each(KINDS)('UpdateHead (%s)', (kind) => {
  it('changes only the Type and records before/after', async () => {
    const heads = new HeadRepo([seeded()]);
    const { store, events } = eventBus();
    const r = await new UpdateHead(kind, { heads, events }).execute(
      { id: 'h-1', nature: 'INDIRECT' },
      officeCtx(),
    );
    expect(r.success && r.data).toMatchObject({ name: 'Generator Diesel', nature: 'INDIRECT' });
    expect(heads.rows[0].nature).toBe('INDIRECT');
    const [event] = store.events;
    expect(event.eventType).toBe(
      kind === 'expense'
        ? BusinessEvents.EXPENSE_CATEGORY_UPDATED
        : BusinessEvents.INCOME_CATEGORY_UPDATED,
    );
    expect(event.payload).toMatchObject({
      categoryId: 'h-1',
      nature: { before: 'DIRECT', after: 'INDIRECT' },
    });
  });

  it('keeps the Type when only the name changes', async () => {
    const heads = new HeadRepo([seeded()]);
    const r = await new UpdateHead(kind, { heads, events: eventBus().events }).execute(
      { id: 'h-1', name: 'Genset Diesel' },
      officeCtx(),
    );
    expect(r.success && r.data).toMatchObject({ name: 'Genset Diesel', nature: 'DIRECT' });
  });

  it('refuses an unknown Type', async () => {
    const heads = new HeadRepo([seeded()]);
    const r = await new UpdateHead(kind, { heads, events: eventBus().events }).execute(
      { id: 'h-1', nature: 'MIXED' },
      officeCtx(),
    );
    expect(!r.success && r.error.code).toBe('VALIDATION_ERROR');
    expect(heads.rows[0].nature).toBe('DIRECT');
  });

  it('refuses an empty update', async () => {
    const r = await new UpdateHead(kind, {
      heads: new HeadRepo([seeded()]),
      events: eventBus().events,
    }).execute({ id: 'h-1' }, officeCtx());
    expect(!r.success && r.error.code).toBe('VALIDATION_ERROR');
  });

  it('is not found for a head of another Organization', async () => {
    const heads = new HeadRepo([seeded({ organizationId: 'org-2' })]);
    const r = await new UpdateHead(kind, { heads, events: eventBus().events }).execute(
      { id: 'h-1', nature: 'INDIRECT' },
      officeCtx(),
    );
    expect(!r.success && r.error.code).toBe('NOT_FOUND');
  });

  it('refuses a rename onto another head, ignoring case', async () => {
    const heads = new HeadRepo([seeded(), seeded({ id: 'h-2', name: 'Tea', nature: 'INDIRECT' })]);
    const r = await new UpdateHead(kind, { heads, events: eventBus().events }).execute(
      { id: 'h-2', name: 'GENERATOR DIESEL' },
      officeCtx(),
    );
    expect(!r.success && r.error.code).toBe('CONFLICT');
  });
});

describe('UpdateHead (income only fields)', () => {
  it('updates the tax configuration and active flag', async () => {
    const heads = new HeadRepo([seeded({ taxConfig: null, isActive: true })]);
    const r = await new UpdateHead('income', { heads, events: eventBus().events }).execute(
      { id: 'h-1', taxConfig: { gst_rate: 18 }, isActive: false },
      officeCtx(),
    );
    expect(r.success && r.data).toMatchObject({ taxConfig: { gst_rate: 18 }, isActive: false });
  });
});
