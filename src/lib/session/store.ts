import { FirestoreSessionStore } from "./firestore-store.ts";
import type { SessionRecord, SessionStore } from "./types";

export { FirestoreSessionStore } from "./firestore-store.ts";

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
 * Production uses `FirestoreSessionStore` (DIO-21) — same Firebase project and
 * service account as the object store (DIO-6), with a native TTL policy on
 * `expiresAt` in place of a cron-driven purge.
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
 * Production uses Firestore (DIO-21). `FirestoreSessionStore` reads its own
 * required secrets via the shared `getFirebaseApp()` helper and throws a clear
 * "missing environment variable" error if they are absent, so a misconfigured
 * deploy fails loudly rather than silently falling back to
 * `InMemorySessionStore` — which loses state on restart and is not shared
 * between instances, either of which would strand a paid student's session.
 *
 * `FirestoreSessionStore` is imported statically, but reaches the Admin SDK's
 * credential-reading code only at construction time, not at module load — so
 * this stays safe for `next build`, which runs with `NODE_ENV=production` but
 * no deploy secrets.
 */
export function createSessionStore(): SessionStore {
  if (process.env.NODE_ENV === "production") {
    return new FirestoreSessionStore();
  }
  return new InMemorySessionStore();
}
