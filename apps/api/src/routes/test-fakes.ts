export function makeFakeDb(
  selectQueue: any[][] = [],
  executeQueue: any[][] = [],
  insertQueue?: any[][],
  options: { onExecute?: (statement: unknown) => void } = {},
) {
  const counter = { selects: 0, executes: 0, inserts: 0, updates: 0, deletes: 0 };
  const chain = (rows: any[]) => {
    const b: any = {
      from: () => b,
      innerJoin: () => b,
      leftJoin: () => b,
      where: () => b,
      orderBy: () => b,
      groupBy: () => b,
      limit: () => b,
      for: () => b,
      set: () => b,
      values: () => b,
      onConflictDoUpdate: () => b,
      onConflictDoNothing: () => b,
      returning: () => Promise.resolve(rows),
      then: (resolve: (v: any[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return b;
  };
  const db: any = {
    select: () => {
      counter.selects += 1;
      return chain(selectQueue.shift() ?? []);
    },
    insert: () => {
      counter.inserts += 1;
      return chain(insertQueue ? (insertQueue.shift() ?? []) : [{ id: 'row-1' }]);
    },
    update: () => {
      counter.updates += 1;
      return chain([]);
    },
    delete: () => {
      counter.deletes += 1;
      return chain([]);
    },
    execute: async (statement: unknown) => {
      counter.executes += 1;
      options.onExecute?.(statement);
      return executeQueue.shift() ?? [];
    },
    transaction: async (run: (tx: any) => Promise<any>) => run(db),
  };
  return { db, counter };
}
