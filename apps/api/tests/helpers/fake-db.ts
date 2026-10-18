export type FakeRow = Record<string, unknown>;

export type WhereCapture = {
  table: unknown;
  method: 'select' | 'update' | 'delete';
  where: unknown;
};

export type InsertPayload = {
  table: unknown;
  values: unknown;
};

export type UpdatePayload = {
  table: unknown;
  set: unknown;
  where: unknown;
};

export type DeleteCapture = {
  table: unknown;
  where: unknown;
};

export type ConflictTargetCapture = {
  table: unknown;
  target: unknown;
};

export interface SelectQuery {
  from(table: unknown): SelectQuery;
  where(predicate: unknown): SelectQuery;
  orderBy(...columns: unknown[]): SelectQuery;
  limit(count: number): SelectQuery;
  offset(count?: number): SelectQuery;
  innerJoin(table: unknown, predicate: unknown): SelectQuery;
  leftJoin(table: unknown, predicate: unknown): SelectQuery;
  then<TResolved = FakeRow[], TRejected = never>(
    onfulfilled?: ((value: FakeRow[]) => TResolved | PromiseLike<TResolved>) | null,
    onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
  ): Promise<TResolved | TRejected>;
}

export interface InsertQuery {
  values(values: unknown): InsertQuery;
  onConflictDoNothing(options?: unknown): Promise<FakeRow[]>;
  onConflictDoUpdate(options: unknown): InsertQuery;
  returning(): Promise<FakeRow[]>;
}

export interface UpdateQuery {
  where(predicate: unknown): UpdateQuery;
  returning(): Promise<FakeRow[]>;
  then<TResolved = FakeRow[], TRejected = never>(
    onfulfilled?: ((value: FakeRow[]) => TResolved | PromiseLike<TResolved>) | null,
    onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
  ): Promise<TResolved | TRejected>;
}

export interface DeleteQuery {
  where(predicate: unknown): Promise<{ rowCount: number }>;
}

class FakeSelectQuery implements SelectQuery {
  private readonly db: FakeDb;
  private table: unknown = undefined;
  private limitCount: number | undefined = undefined;

  constructor(db: FakeDb) {
    this.db = db;
  }

  from(table: unknown): SelectQuery {
    this.table = table;
    return this;
  }

  where(predicate: unknown): SelectQuery {
    this.db.captureWhere('select', this.table, predicate);
    return this;
  }

  orderBy(): SelectQuery {
    return this;
  }

  limit(count: number): SelectQuery {
    this.limitCount = count;
    return this;
  }

  offset(): SelectQuery {
    return this;
  }

  innerJoin(): SelectQuery {
    return this;
  }

  leftJoin(): SelectQuery {
    return this;
  }

  then<TResolved = FakeRow[], TRejected = never>(
    onfulfilled?: ((value: FakeRow[]) => TResolved | PromiseLike<TResolved>) | null,
    onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
  ): Promise<TResolved | TRejected> {
    return Promise.resolve(this.db.takeRows(this.table, this.limitCount)).then(
      onfulfilled,
      onrejected,
    );
  }
}

class FakeInsertQuery implements InsertQuery {
  private readonly db: FakeDb;
  private readonly table: unknown;

  constructor(db: FakeDb, table: unknown) {
    this.db = db;
    this.table = table;
  }

  values(values: unknown): InsertQuery {
    this.db.captureInsert(this.table, values);
    return this;
  }

  onConflictDoNothing(): Promise<FakeRow[]> {
    return Promise.resolve([]);
  }

  onConflictDoUpdate(options?: unknown): InsertQuery {
    this.db.captureConflictTarget(this.table, options);
    return this;
  }

  returning(): Promise<FakeRow[]> {
    return Promise.resolve(this.db.takeRows(this.table));
  }
}

class FakeUpdateQuery implements UpdateQuery {
  private readonly db: FakeDb;
  private readonly table: unknown;
  private readonly values: unknown;

  constructor(db: FakeDb, table: unknown, values: unknown) {
    this.db = db;
    this.table = table;
    this.values = values;
  }

  where(predicate: unknown): UpdateQuery {
    this.db.captureUpdate(this.table, this.values, predicate);
    return this;
  }

  returning(): Promise<FakeRow[]> {
    return Promise.resolve(this.db.takeRows(this.table));
  }

  then<TResolved = FakeRow[], TRejected = never>(
    onfulfilled?: ((value: FakeRow[]) => TResolved | PromiseLike<TResolved>) | null,
    onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
  ): Promise<TResolved | TRejected> {
    return Promise.resolve(this.db.takeRows(this.table)).then(onfulfilled, onrejected);
  }
}

class FakeDeleteQuery implements DeleteQuery {
  private readonly db: FakeDb;
  private readonly table: unknown;

  constructor(db: FakeDb, table: unknown) {
    this.db = db;
    this.table = table;
  }

  where(predicate: unknown): Promise<{ rowCount: number }> {
    this.db.captureDelete(this.table, predicate);
    return Promise.resolve({ rowCount: this.db.takeRows(this.table).length });
  }
}

export class FakeDb {
  private readonly queues = new Map<unknown, FakeRow[][]>();
  private readonly fallbacks = new Map<unknown, FakeRow[]>();
  private readonly selectFields: unknown[] = [];
  private readonly whereCaptures: WhereCapture[] = [];
  private readonly insertPayloads: InsertPayload[] = [];
  private readonly updatePayloads: UpdatePayload[] = [];
  private readonly deleteCaptures: DeleteCapture[] = [];
  private readonly conflictTargets: ConflictTargetCapture[] = [];

  queueResults(table: unknown, ...batches: FakeRow[][]): void {
    const queue = this.queues.get(table) ?? [];
    for (const batch of batches) {
      queue.push(batch);
    }
    this.queues.set(table, queue);
  }

  setResults(table: unknown, rows: FakeRow[]): void {
    this.queues.set(table, [rows]);
    this.fallbacks.set(table, rows);
  }

  takeRows(table: unknown, limitCount?: number): FakeRow[] {
    const queue = this.queues.get(table);
    const queued = queue && queue.length > 0 ? queue.shift() : undefined;
    const rows = queued ?? this.fallbacks.get(table) ?? [];
    if (typeof limitCount === 'number' && rows.length > limitCount) {
      return rows.slice(0, limitCount);
    }
    return rows;
  }

  getResultsFor(table: unknown): FakeRow[] {
    return this.takeRows(table);
  }

  select(fields?: unknown): SelectQuery {
    if (fields !== undefined) {
      this.selectFields.push(fields);
    }
    return new FakeSelectQuery(this);
  }

  insert(table: unknown): InsertQuery {
    return new FakeInsertQuery(this, table);
  }

  update(table: unknown): { set(values: unknown): UpdateQuery } {
    return {
      set: (values: unknown): UpdateQuery => new FakeUpdateQuery(this, table, values),
    };
  }

  delete(table: unknown): DeleteQuery {
    return new FakeDeleteQuery(this, table);
  }

  captureWhere(method: WhereCapture['method'], table: unknown, where: unknown): void {
    this.whereCaptures.push({ table, method, where });
  }

  captureInsert(table: unknown, values: unknown): void {
    this.insertPayloads.push({ table, values });
  }

  captureUpdate(table: unknown, set: unknown, where: unknown): void {
    this.updatePayloads.push({ table, set, where });
    this.captureWhere('update', table, where);
  }

  captureDelete(table: unknown, where: unknown): void {
    this.deleteCaptures.push({ table, where });
    this.captureWhere('delete', table, where);
  }

  captureConflictTarget(table: unknown, options: unknown): void {
    const target =
      typeof options === 'object' && options !== null && 'target' in options
        ? (options as { target: unknown }).target
        : undefined;
    this.conflictTargets.push({ table, target });
  }

  getWhereCaptures(): WhereCapture[] {
    return this.whereCaptures;
  }

  getInsertPayloads(): InsertPayload[] {
    return this.insertPayloads;
  }

  getUpdatePayloads(): UpdatePayload[] {
    return this.updatePayloads;
  }

  getDeleteCaptures(): DeleteCapture[] {
    return this.deleteCaptures;
  }

  getConflictTargets(): ConflictTargetCapture[] {
    return this.conflictTargets;
  }

  getSelectFields(): unknown[] {
    return this.selectFields;
  }

  getDb(): FakeDb {
    return this;
  }

  reset(): void {
    this.queues.clear();
    this.fallbacks.clear();
    this.selectFields.length = 0;
    this.whereCaptures.length = 0;
    this.insertPayloads.length = 0;
    this.updatePayloads.length = 0;
    this.deleteCaptures.length = 0;
    this.conflictTargets.length = 0;
  }
}

export function createFakeDb(): FakeDb {
  return new FakeDb();
}