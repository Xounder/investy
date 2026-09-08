/**
 * Broker repository.
 * Brokers are global (not user-owned) but have a seeded catalog.
 */
import { getDb } from '../db/client.js';
import { brokers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { BrokerTable, NewBroker } from '../db/schema.js';

export const brokerRepository = {
  /** Finds a broker by ID. */
  async findById(id: string): Promise<BrokerTable | null> {
    const db = getDb();
    const [broker] = await db.select().from(brokers).where(eq(brokers.id, id)).limit(1);
    return broker ?? null;
  },

  /** Finds a broker by code. */
  async findByCode(code: string): Promise<BrokerTable | null> {
    const db = getDb();
    const [broker] = await db.select().from(brokers).where(eq(brokers.code, code)).limit(1);
    return broker ?? null;
  },

  /** Lists all brokers. */
  async list(): Promise<BrokerTable[]> {
    const db = getDb();
    return db.select().from(brokers).orderBy(brokers.name);
  },

  /** Creates a new broker (custom). */
  async create(data: NewBroker): Promise<BrokerTable> {
    const db = getDb();
    const [broker] = await db.insert(brokers).values(data).returning();
    if (!broker) throw new Error('Failed to create broker');
    return broker;
  },

  /** Upserts a broker by code (for seeding). */
  async upsertByCode(data: NewBroker): Promise<BrokerTable> {
    const db = getDb();
    const existing = await this.findByCode(data.code!);
    if (existing) {
      const [updated] = await db
        .update(brokers)
        .set({ name: data.name, url: data.url, isSeeded: data.isSeeded ?? true })
        .where(eq(brokers.id, existing.id))
        .returning();
      if (!updated) throw new Error('Failed to update broker');
      return updated;
    }
    return this.create(data);
  },

  /** Seeds the default broker catalog (idempotent). */
  async seedCatalog(): Promise<BrokerTable[]> {
    const seededBrokers: NewBroker[] = [
      { id: crypto.randomUUID(), name: 'XP Investimentos', code: 'xp', url: 'https://www.xpi.com.br', isSeeded: true },
      { id: crypto.randomUUID(), name: 'Rico', code: 'rico', url: 'https://www.rico.com.vc', isSeeded: true },
      { id: crypto.randomUUID(), name: 'Clear', code: 'clear', url: 'https://www.clear.com.br', isSeeded: true },
      { id: crypto.randomUUID(), name: 'NuInvest', code: 'nuinvest', url: 'https://www.nuinvest.com.br', isSeeded: true },
      { id: crypto.randomUUID(), name: 'Inter', code: 'inter', url: 'https://www.bancointer.com.br', isSeeded: true },
    ];

    const results: BrokerTable[] = [];
    for (const broker of seededBrokers) {
      const result = await this.upsertByCode(broker);
      results.push(result);
    }
    return results;
  },
};