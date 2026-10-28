import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql as dsql } from 'drizzle-orm';
import { schema, type DbClient, type DbExecutor } from '@pump/db';
import {
  DrizzleBusinessDayRepository,
  DrizzleShiftRepository,
  DrizzleShiftWriteGateReader,
} from '../station-ops-repositories.js';

/**
 * DrizzleShiftWriteGateReader against a real Postgres (#248).
 *
 * The gate folds the six sequential Station -> Business Day -> Shift
 * lock-discipline reads into two statements. Only a real server can prove the
 * row locks are still taken, in the canonical order, and that the rows it
 * returns are the ones committed by any transaction it waited behind.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'shift_write_gate_it';

const ORG = '00000000-0000-0000-0000-00000000e101';
const OTHER_ORG = '00000000-0000-0000-0000-00000000e102';
const STATION = '00000000-0000-0000-0000-00000000e103';
const MANAGER = '00000000-0000-0000-0000-00000000e104';
const ATTENDANT = '00000000-0000-0000-0000-00000000e105';
const TEMPLATE = '00000000-0000-0000-0000-00000000e106';
const DAY = '00000000-0000-0000-0000-00000000e107';
const SHIFT = '00000000-0000-0000-0000-00000000e108';
const DU = '00000000-0000-0000-0000-00000000e109';
const MISSING = '00000000-0000-0000-0000-00000000e1ff';

const OTHER_STATION = '00000000-0000-0000-0000-00000000e10a';

const TARGET = {
  organizationId: ORG,
  stationId: STATION,
  businessDayId: DAY,
  shiftId: SHIFT,
  writableDayStatuses: ['OPEN'] as const,
};

const BOOTSTRAP = `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
  exception when others then
    null;
  end $$;

  drop schema if exists ${TEST_SCHEMA} cascade;
  create schema ${TEST_SCHEMA};
`;

function shippedSchema(): string {
  const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/(?:"public"|public)\./g, `"${TEST_SCHEMA}".`);
}

type Table = 'stations' | 'business_days' | 'shifts';

describe.skipIf(!CONNECTION)('DrizzleShiftWriteGateReader against real Postgres', () => {
  const clients: postgres.Sql[] = [];
  let db: DbClient;
  let gateDb: DbClient;
  let blocker: postgres.Sql;
  let probe: postgres.Sql;

  const connect = () => {
    const client = postgres(CONNECTION!, {
      max: 1,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    clients.push(client);
    return client;
  };

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872634)');
      await bootstrap.unsafe(BOOTSTRAP);
      await bootstrap.unsafe(
        `set search_path to ${TEST_SCHEMA};` +
          shippedSchema().replace(
            /create trigger on_auth_user_created/gi,
            'create or replace trigger on_auth_user_created',
          ),
      );
      await bootstrap.unsafe('select pg_advisory_unlock(872634)');
    } finally {
      await bootstrap.end();
    }
    db = drizzle(connect(), { schema }) as unknown as DbClient;
    gateDb = drizzle(connect(), { schema }) as unknown as DbClient;
    blocker = connect();
    probe = connect();
    await seed();
  }, 60_000);

  afterAll(async () => {
    const [first] = clients;
    if (first) {
      await first.unsafe('select pg_advisory_lock(872634)');
      await first.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await first.unsafe('select pg_advisory_unlock(872634)');
    }
    await Promise.all(clients.map((c) => c.end()));
  });

  async function seed() {
    await db.insert(schema.organizations).values([
      { id: ORG, name: 'Tenant A' },
      { id: OTHER_ORG, name: 'Tenant B' },
    ]);
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' });
    await db.insert(schema.users).values([
      { id: MANAGER, organizationId: ORG, fullName: 'Meera', role: 'Manager', status: 'ACTIVE' },
      { id: ATTENDANT, organizationId: ORG, fullName: 'Arun', role: 'Attendant', status: 'ACTIVE' },
    ]);
    await db.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: ORG,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
    });
    await db.insert(schema.dispenserUnits).values({
      id: DU,
      organizationId: ORG,
      stationId: STATION,
      name: 'DU-1',
      code: 'DU1',
      status: 'ACTIVE',
    });
    await db.insert(schema.businessDays).values({
      id: DAY,
      organizationId: ORG,
      stationId: STATION,
      businessDate: '2026-03-10',
      status: 'OPEN',
      openedBy: MANAGER,
    });
    await db.insert(schema.shifts).values({
      id: SHIFT,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: DAY,
      shiftTemplateId: TEMPLATE,
      status: 'OPEN',
      openedBy: MANAGER,
      closingCash: '125.50',
    });
    await db.insert(schema.shiftStaffAssignments).values({
      shiftId: SHIFT,
      userId: ATTENDANT,
      duId: DU,
      openingFloat: '1000',
    });
  }

  /** Whether another session holds a row lock on `table`.`id` right now. */
  async function isLocked(table: Table, id: string): Promise<boolean> {
    try {
      await probe.begin((t) =>
        t.unsafe(`select 1 from ${table} where id = $1 for update nowait`, [id]),
      );
      return false;
    } catch (error) {
      if ((error as { code?: string }).code === '55P03') return true;
      throw error;
    }
  }

  async function waitUntilBlocked(pid: number) {
    for (let i = 0; i < 200; i++) {
      const [row] = await probe`select wait_event_type from pg_stat_activity where pid = ${pid}`;
      if (row?.wait_event_type === 'Lock') return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`backend ${pid} never blocked on a lock`);
  }

  /**
   * Run `work` on the gate connection inside a transaction that stays open
   * (holding its locks) until `inspect` has finished.
   */
  async function inGateTransaction<T>(
    work: (tx: DbExecutor) => Promise<T>,
    inspect: (result: T) => Promise<void>,
  ) {
    await gateDb.transaction(async (tx) => {
      const result = await work(tx);
      await inspect(result);
    });
  }

  /** Start the gate's lock statement while `held` is locked by another session. */
  async function lockBehind(held: Table, heldId: string) {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let blockerReady!: () => void;
    const ready = new Promise<void>((r) => (blockerReady = r));
    const blocking = blocker.begin(async (t) => {
      await t.unsafe(`select 1 from ${held} where id = $1 for update`, [heldId]);
      blockerReady();
      await released;
    });
    await ready;

    let pid = 0;
    let observed: Record<Table, boolean> | null = null;
    const gate = gateDb.transaction(async (tx) => {
      const [row] = (await tx.execute(dsql`select pg_backend_pid() as pid`)) as unknown as [
        { pid: number },
      ];
      pid = row.pid;
      const locking = new DrizzleShiftWriteGateReader(tx).lockForWrite(TARGET);
      await waitUntilBlocked(pid);
      observed = {
        stations: await isLocked('stations', STATION),
        business_days: await isLocked('business_days', DAY),
        shifts: await isLocked('shifts', SHIFT),
      };
      release();
      return locking;
    });
    await blocking;
    const result = await gate;
    return { observed: observed!, result };
  }

  it('discovers the shift and its business day exactly as the repositories read them', async () => {
    const gate = new DrizzleShiftWriteGateReader(db);
    const discovered = await gate.discover(SHIFT);
    const { openingCash, ...shift } = (await new DrizzleShiftRepository(db).findByIdWithoutLock(
      SHIFT,
    ))!;
    expect(discovered).toEqual({
      shift,
      businessDay: await new DrizzleBusinessDayRepository(db).findById(DAY),
    });
    expect(discovered.shift?.closingCash).toBe('125.50');
    expect(await gate.readOpeningCash(SHIFT)).toBe(openingCash);
    expect(openingCash).toBe('1000.00');
    expect(await gate.discover(MISSING)).toEqual({ shift: null, businessDay: null });
  });

  it('discovers without taking any row lock', async () => {
    await inGateTransaction(
      (tx) => new DrizzleShiftWriteGateReader(tx).discover(SHIFT),
      async () => {
        expect(await isLocked('stations', STATION)).toBe(false);
        expect(await isLocked('business_days', DAY)).toBe(false);
        expect(await isLocked('shifts', SHIFT)).toBe(false);
      },
    );
  });

  it('locks Station, Business Day and Shift and returns the rows the repositories read', async () => {
    await inGateTransaction(
      (tx) => new DrizzleShiftWriteGateReader(tx).lockForWrite(TARGET),
      async (locked) => {
        expect(await isLocked('stations', STATION)).toBe(true);
        expect(await isLocked('business_days', DAY)).toBe(true);
        expect(await isLocked('shifts', SHIFT)).toBe(true);
        const { openingCash: _derived, ...shift } = (await new DrizzleShiftRepository(
          db,
        ).findByIdWithoutLock(SHIFT))!;
        expect(locked).toEqual({
          shift,
          businessDay: await new DrizzleBusinessDayRepository(db).findById(DAY),
        });
      },
    );
    expect(await isLocked('stations', STATION)).toBe(false);
  });

  it('takes the Station lock before the Business Day and Shift locks', async () => {
    const { observed, result } = await lockBehind('stations', STATION);
    expect(observed).toEqual({ stations: true, business_days: false, shifts: false });
    expect(result.shift?.id).toBe(SHIFT);
  });

  it('takes the Business Day lock after the Station and before the Shift', async () => {
    const { observed, result } = await lockBehind('business_days', DAY);
    expect(observed).toEqual({ stations: true, business_days: true, shifts: false });
    expect(result.businessDay?.id).toBe(DAY);
  });

  it('takes the Shift lock last, holding the Station and Business Day while it waits', async () => {
    const { observed } = await lockBehind('shifts', SHIFT);
    expect(observed).toEqual({ stations: true, business_days: true, shifts: true });
  });

  it('returns the Business Day and Shift as committed by the transaction it waited behind', async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let ready!: () => void;
    const blockerReady = new Promise<void>((r) => (ready = r));
    const closing = blocker.begin(async (t) => {
      await t`select 1 from stations where id = ${STATION} for update`;
      await t`update business_days set status = 'CLOSED' where id = ${DAY}`;
      await t`update shifts set status = 'CLOSED' where id = ${SHIFT}`;
      ready();
      await released;
    });
    await blockerReady;

    const result = await gateDb.transaction(async (tx) => {
      const [row] = (await tx.execute(dsql`select pg_backend_pid() as pid`)) as unknown as [
        { pid: number },
      ];
      const locking = new DrizzleShiftWriteGateReader(tx).lockForWrite({
        ...TARGET,
        writableDayStatuses: ['OPEN', 'CLOSED'],
      });
      await waitUntilBlocked(row.pid);
      release();
      return locking;
    });
    await closing;
    try {
      expect(result.businessDay?.status).toBe('CLOSED');
      expect(result.shift?.status).toBe('CLOSED');
    } finally {
      await db
        .update(schema.businessDays)
        .set({ status: 'OPEN' })
        .where(eq(schema.businessDays.id, DAY));
      await db.update(schema.shifts).set({ status: 'OPEN' }).where(eq(schema.shifts.id, SHIFT));
    }
  });

  it('reads the Opening Floats as committed by the transaction the gate waited behind', async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let ready!: () => void;
    const blockerReady = new Promise<void>((r) => (ready = r));
    const reassigning = blocker.begin(async (t) => {
      await t`select 1 from stations where id = ${STATION} for update`;
      await t`update shift_staff_assignments set opening_float = 1500 where shift_id = ${SHIFT}`;
      ready();
      await released;
    });
    await blockerReady;

    try {
      await gateDb.transaction(async (tx) => {
        const [row] = (await tx.execute(dsql`select pg_backend_pid() as pid`)) as unknown as [
          { pid: number },
        ];
        const gate = new DrizzleShiftWriteGateReader(tx);
        const locking = gate.lockForWrite(TARGET);
        await waitUntilBlocked(row.pid);
        release();
        await reassigning;
        const locked = await locking;
        // The lock statement's snapshot predates the wait, so it carries no Opening Floats.
        expect(locked.shift).not.toHaveProperty('openingCash');
        expect(await gate.readOpeningCash(SHIFT)).toBe('1500.00');
      });
    } finally {
      await db
        .update(schema.shiftStaffAssignments)
        .set({ openingFloat: '1000' })
        .where(eq(schema.shiftStaffAssignments.shiftId, SHIFT));
    }
  });

  it('scopes the Station and Business Day locks to the organization, as lockStation/lockById do', async () => {
    await inGateTransaction(
      (tx) =>
        new DrizzleShiftWriteGateReader(tx).lockForWrite({ ...TARGET, organizationId: OTHER_ORG }),
      async (locked) => {
        expect(await isLocked('stations', STATION)).toBe(false);
        expect(await isLocked('business_days', DAY)).toBe(false);
        // No Business Day in the organization, so the write is refused before the Shift lock.
        expect(await isLocked('shifts', SHIFT)).toBe(false);
        expect(locked).toEqual({ shift: null, businessDay: null });
      },
    );
  });

  it('locks the Day without a Station row, but never the Shift without a qualifying Day', async () => {
    await inGateTransaction(
      (tx) =>
        new DrizzleShiftWriteGateReader(tx).lockForWrite({
          ...TARGET,
          stationId: MISSING,
        }),
      async (locked) => {
        expect(await isLocked('business_days', DAY)).toBe(true);
        expect(await isLocked('shifts', SHIFT)).toBe(false);
        expect(locked.businessDay?.id).toBe(DAY);
      },
    );
    await inGateTransaction(
      (tx) =>
        new DrizzleShiftWriteGateReader(tx).lockForWrite({
          ...TARGET,
          businessDayId: MISSING,
        }),
      async (locked) => {
        expect(await isLocked('stations', STATION)).toBe(true);
        expect(await isLocked('shifts', SHIFT)).toBe(false);
        expect(locked).toEqual({ shift: null, businessDay: null });
      },
    );
  });

  async function setDayStatus(status: 'OPEN' | 'CLOSED') {
    await db.update(schema.businessDays).set({ status }).where(eq(schema.businessDays.id, DAY));
  }

  it('locks the Shift under a closed day only when a closed day admits the write', async () => {
    await setDayStatus('CLOSED');
    try {
      await inGateTransaction(
        (tx) => new DrizzleShiftWriteGateReader(tx).lockForWrite(TARGET),
        async (locked) => {
          expect(await isLocked('stations', STATION)).toBe(true);
          expect(await isLocked('business_days', DAY)).toBe(true);
          expect(await isLocked('shifts', SHIFT)).toBe(false);
          expect(locked.businessDay?.status).toBe('CLOSED');
          expect(locked.shift).toBeNull();
        },
      );
      await inGateTransaction(
        (tx) =>
          new DrizzleShiftWriteGateReader(tx).lockForWrite({
            ...TARGET,
            writableDayStatuses: ['OPEN', 'CLOSED'],
          }),
        async (locked) => {
          expect(await isLocked('shifts', SHIFT)).toBe(true);
          expect(locked.shift?.id).toBe(SHIFT);
        },
      );
    } finally {
      await setDayStatus('OPEN');
    }
  });

  it('does not lock the Shift when the locked day belongs to another station', async () => {
    await inGateTransaction(
      (tx) =>
        new DrizzleShiftWriteGateReader(tx).lockForWrite({ ...TARGET, stationId: OTHER_STATION }),
      async (locked) => {
        expect(await isLocked('business_days', DAY)).toBe(true);
        expect(await isLocked('shifts', SHIFT)).toBe(false);
        expect(locked.shift).toBeNull();
      },
    );
  });

  it('leaves the Shift unlocked when the day it waited on was closed in the meantime', async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let ready!: () => void;
    const blockerReady = new Promise<void>((r) => (ready = r));
    const closing = blocker.begin(async (t) => {
      await t`select 1 from stations where id = ${STATION} for update`;
      await t`update business_days set status = 'CLOSED' where id = ${DAY}`;
      ready();
      await released;
    });
    await blockerReady;

    try {
      await gateDb.transaction(async (tx) => {
        const [row] = (await tx.execute(dsql`select pg_backend_pid() as pid`)) as unknown as [
          { pid: number },
        ];
        const locking = new DrizzleShiftWriteGateReader(tx).lockForWrite(TARGET);
        await waitUntilBlocked(row.pid);
        release();
        await closing;
        const locked = await locking;
        expect(locked.businessDay?.status).toBe('CLOSED');
        expect(locked.shift).toBeNull();
        expect(await isLocked('shifts', SHIFT)).toBe(false);
      });
    } finally {
      await setDayStatus('OPEN');
    }
  });
});
