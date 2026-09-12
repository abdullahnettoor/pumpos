import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  EventActivityCatalog,
  eventFromContext,
  relatedEventFromContext,
  renderEventActivity,
  type ExecutionContext,
} from './index.js';

const context: ExecutionContext = {
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: 'day-1',
  actorId: 'user-1',
  correlationId: 'command-1',
  actorSnapshot: {
    kind: 'tenant_user',
    displayName: 'Asha Shah',
    role: 'Owner',
    subjectId: 'user-1',
  },
  clock: { now: () => new Date('2026-08-22T05:00:00.000Z') },
  ids: { newId: () => 'event-1' },
};

describe('event activity', () => {
  it('covers every registered business event', () => {
    expect(Object.keys(EventActivityCatalog).sort()).toEqual(Object.values(BusinessEvents).sort());
  });

  it('renders registered INR templates with immutable display values', () => {
    const rendered = renderEventActivity({
      eventType: BusinessEvents.CREDIT_SALE_CREATED,
      metadata: {
        presentation: {
          templateId: 'credit-sale.product.v1',
          values: { customerName: 'Bharat Transport', itemSummary: '250 L of Diesel', amount: 82500 },
        },
      },
    });

    expect(rendered).toMatchObject({
      title: 'Credit sale recorded',
      description: 'Recorded a credit sale to Bharat Transport: 250 L of Diesel for ₹82,500.00.',
      renderStatus: 'rendered',
    });
  });

  it('renders Handover display values captured at action time', () => {
    const rendered = renderEventActivity({
      eventType: BusinessEvents.HANDOVER_RECORDED,
      metadata: {
        presentation: {
          templateId: 'handover-recorded.v1',
          values: { attendantName: 'Asha Nair', duName: 'Dispenser 1' },
        },
      },
    });

    expect(rendered).toMatchObject({
      title: 'Handover recorded',
      description: "Recorded Asha Nair's handover for Dispenser 1.",
      renderStatus: 'rendered',
    });
  });

  it('falls back safely for missing or unregistered presentation data', () => {
    expect(renderEventActivity({
      eventType: BusinessEvents.CREDIT_SALE_CREATED,
      metadata: { presentation: { templateId: 'credit-sale.product.v1', values: { customerName: 'Bharat' } } },
    })).toMatchObject({ description: 'Credit sale recorded', renderStatus: 'fallback' });

    expect(renderEventActivity({
      eventType: 'FUTURE_EVENT',
      metadata: {},
    })).toMatchObject({ title: 'Future Event', renderStatus: 'fallback', diagnostic: 'unknown-event-type' });
  });

  it('adds actor snapshots and primary/related roles without creating causation', () => {
    const primary = eventFromContext(context, {
      eventType: BusinessEvents.PURCHASE_CREATED,
      aggregateType: 'purchase',
      aggregateId: 'purchase-1',
      payload: {},
    });
    const related = relatedEventFromContext(context, {
      eventType: BusinessEvents.GOODS_RECEIVED,
      aggregateType: 'purchase',
      aggregateId: 'purchase-1',
      payload: {},
    });

    expect(primary.correlationId).toBe('command-1');
    expect(primary.metadata).toMatchObject({
      grouping: { role: 'primary' },
      actorSnapshot: { kind: 'tenant_user', displayName: 'Asha Shah' },
    });
    expect(related.correlationId).toBe('command-1');
    expect(related.causationId).toBeNull();
    expect(related.metadata).toMatchObject({ grouping: { role: 'related' } });
  });
});
