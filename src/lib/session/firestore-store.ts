import { Timestamp, getFirestore } from "firebase-admin/firestore";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../firebase-app.ts";
import type { SessionRecord, SessionStore } from "./types.ts";

const COLLECTION = "sessions";

/**
 * Firestore-backed session store (DIO-21 production backend).
 *
 * One Firebase project, one service account, shared with `FirebaseObjectStore`
 * (DIO-6) via `getFirebaseApp()`. Unlike the object store, this needs no
 * bucket-lifecycle-style backstop of its own: Firestore's native TTL policy on
 * `expiresAt` is the enforcement mechanism, configured in the GCP console —
 * Firestore, like the Storage bucket lifecycle rule, exposes no SDK call to
 * set it. TTL deletion is best-effort on timing (typically within 24h of
 * expiry), so expiry is still enforced on every read, same as the in-memory
 * store and `FirebaseObjectStore`.
 *
 * `expiresAt` is stored as a Firestore `Timestamp`, not a plain number — the
 * TTL policy requires that field type.
 */
export class FirestoreSessionStore implements SessionStore {
  private readonly db: Firestore;

  constructor(db: Firestore = getFirestore(getFirebaseApp())) {
    this.db = db;
  }

  async create(record: SessionRecord): Promise<void> {
    await this.db.collection(COLLECTION).doc(record.id).set(toDoc(record));
  }

  async get(id: string): Promise<SessionRecord | null> {
    const snapshot = await this.db.collection(COLLECTION).doc(id).get();
    if (!snapshot.exists) return null;

    const record = fromDoc(snapshot.data()!);

    // Expiry is enforced on read as well as by the TTL policy, so a session
    // can never outlive its files even if TTL collection runs late.
    if (record.expiresAt <= Date.now()) {
      await this.db.collection(COLLECTION).doc(id).delete();
      return null;
    }

    return record;
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
      // Restated rather than trusted from the patch, same guarantee as the
      // in-memory store: widening expiresAt would silently defeat the
      // retention guarantee PRD §9 lists as never-cut.
      id: existing.id,
      createdAt: existing.createdAt,
      expiresAt: existing.expiresAt,
    };

    await this.db.collection(COLLECTION).doc(id).set(toDoc(updated));
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.collection(COLLECTION).doc(id).delete();
  }

  async purgeExpired(now: number = Date.now()): Promise<number> {
    const snapshot = await this.db
      .collection(COLLECTION)
      .where("expiresAt", "<=", Timestamp.fromMillis(now))
      .get();

    let purged = 0;
    await Promise.all(
      snapshot.docs.map(async (doc) => {
        await doc.ref.delete();
        purged += 1;
      }),
    );
    return purged;
  }
}

/**
 * `SessionRecord` carries several optional fields (`upload`, `specialtyId`,
 * `payment.paidAt`, ...). The Admin SDK rejects `undefined` property values by
 * default, so they are stripped rather than written as `null` — a field that
 * was never set should not exist on the document at all.
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefined(entry)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) result[key] = stripUndefined(entry);
    }
    return result as T;
  }
  return value;
}

function toDoc(record: SessionRecord): DocumentData {
  return {
    ...stripUndefined(record),
    expiresAt: Timestamp.fromMillis(record.expiresAt),
  };
}

function fromDoc(data: DocumentData): SessionRecord {
  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : Number(data.expiresAt);
  return { ...(data as unknown as SessionRecord), expiresAt };
}
