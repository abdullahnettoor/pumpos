import { describe, expect, it } from 'vitest';
import type { DomainEvent, EventPublisher } from '@pump/core';
import type { DbClient } from '@pump/db';
import { runInTransaction } from './transaction.js';

interface HandoverState {
  declarations: string[];
  terminalEntries: string[];
  nozzleReadings: string[];
  events: string[];
}

function transactionalState(initial: HandoverState) {
  const state = structuredClone(initial);
  const db = {
    transaction: async (execute: (tx: DbClient) => Promise<unknown>) => {
      const before = structuredClone(state);
      try {
        return await execute(db as unknown as DbClient);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  } as unknown as DbClient;
  const events: EventPublisher = {
    publish: async (published: ReadonlyArray<DomainEvent>) => {
      state.events.push(...published.map((event) => event.eventType));
    },
  };
  return { state, db, events };
}

describe('runInTransaction Handover atomicity', () => {
  it.each(['declaration', 'terminal detail', 'Nozzle Reading', 'Business Event'])(
    'rolls back all Handover effects when persistence fails after %s',
    async (failAfter) => {
      const initial: HandoverState = {
        declarations: ['prior-declaration'],
        terminalEntries: ['prior-terminal'],
        nozzleReadings: ['prior-reading'],
        events: ['PRIOR_EVENT'],
      };
      const { state, db, events } = transactionalState(initial);

      await expect(runInTransaction(db, async (_tx, publisher) => {
        state.declarations = ['replacement-declaration'];
        if (failAfter === 'declaration') throw new Error('injected failure');
        state.terminalEntries = ['replacement-terminal'];
        if (failAfter === 'terminal detail') throw new Error('injected failure');
        state.nozzleReadings = ['replacement-reading'];
        if (failAfter === 'Nozzle Reading') throw new Error('injected failure');
        await publisher.publish([{ eventType: 'HANDOVER_RECORDED' } as DomainEvent]);
        if (failAfter === 'Business Event') throw new Error('injected failure');
        return { success: true, data: undefined };
      }, () => events)).rejects.toThrow('injected failure');

      expect(state).toEqual(initial);
    },
  );
});
