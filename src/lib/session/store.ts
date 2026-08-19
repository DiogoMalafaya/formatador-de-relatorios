import type { SessionRecord, SessionStore } from "./types";

/**
 * In-memory session store.
 *
 * **Development and test only — this must never back production.**
 *
 * Two ways it fails in production, both of which cost a student the CV they paid
 * for: state is lost on restart or redeploy, and it is not shared between
 * instances, so the Stripe webhook can mark a session paid on one instance while
 * the student's browser polls another. PRD §9 lists payment correctness as
 * never-cut, and this store cannot uphold it.
 *
 * Production needs a shared store with TTL support — Redis is the obvious fit,
 * and its native key expiry lines up with the retention guarantee. That choice
 * is still open; see the DIO-7 comment thread.
 *
 * `createSessionStore()` below refuses to hand this out in production rather
 * than letting the gap ship quietly.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();

  async create(record: SessionRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record));
  }

  async get(id: string): Promise<SessionRecord | null> {
    const record = this.records.get(id);
    if (!record) return null;

    // Expiry is enforced on read as well as by the purge job, so a session can
    // never outlive its files even if the purge is late or has failed.
    if (record.expiresAt <= Date.now()) {
      this.records.delete(id);
      return null;
    }

    return structuredClone(record);
  }

  async update(
    id: string,
    patch: Partial<Omit<SessionRecord, "id" | "createdAt" | "expiresAt">>,
  ): Promise<SessionRecord | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: SessionRecord = {
      ...existing,
      ...patch,
      // Restated rather than trusted from the patch: the type forbids these,
      // but a plain object cast at a call site would slip past the compiler,
      // and widening expiresAt would silently defeat the retention guarantee.
      id: existing.id,
      createdAt: existing.createdAt,
      expiresAt: existing.expiresAt,
    };

    this.records.set(id, structuredClone(updated));
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async purgeExpired(now: number = Date.now()): Promise<number> {
    let purged = 0;
    for (const [id, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(id);
        purged += 1;
      }
    }
    return purged;
  }

  /** Test helper. Not part of the SessionStore contract. */
  get size(): number {
    return this.records.size;
  }
}

/**
 * Builds the store for the current environment.
 *
 * Throws in production rather than falling back to the in-memory store: an
 * outage is recoverable, and silently losing a paid student's document is not.
 */
export function createSessionStore(): SessionStore {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No production session store is configured. InMemorySessionStore loses " +
        "state on restart and is not shared between instances, which would " +
        "drop paid sessions. Configure a shared store before deploying.",
    );
  }
  return new InMemorySessionStore();
}
