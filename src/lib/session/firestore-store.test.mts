import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { FirestoreSessionStore } from "./firestore-store.ts";
import { defineSessionStoreContract } from "./contract.mts";
import { generateSessionId } from "./token.ts";

/**
 * A hand-rolled double for the tiny slice of the Admin SDK's Firestore API
 * `FirestoreSessionStore` actually calls. Exercises Timestamp conversion,
 * undefined-field stripping and the expiry query without a real Firestore
 * project or network access — same rationale as `FakeBucket` in
 * `storage/firebase-store.test.mts`.
 */
/**
 * Deep-clones a stored document, leaving `Timestamp` instances (an immutable
 * value type) shared rather than cloned — `structuredClone` cannot preserve
 * their prototype, and there is no mutation hazard in sharing an immutable
 * value.
 */
function cloneDoc<T>(value: T): T {
  if (value instanceof Timestamp) return value;
  if (Array.isArray(value)) return value.map((entry) => cloneDoc(entry)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = cloneDoc(entry);
    }
    return result as T;
  }
  return value;
}

class FakeDocRef {
  private readonly collection: FakeCollection;
  readonly id: string;

  constructor(collection: FakeCollection, id: string) {
    this.collection = collection;
    this.id = id;
  }

  async get(): Promise<{ exists: boolean; data: () => DocumentData | undefined }> {
    const data = this.collection.docs.get(this.id);
    // Real Firestore deserializes a fresh object graph from the wire on every
    // read, so a `payment`/`upload` sub-object from one snapshot is never the
    // same reference as from another. Clone here so the fake matches that.
    return { exists: data !== undefined, data: () => (data ? cloneDoc(data) : undefined) };
  }

  async set(data: DocumentData): Promise<void> {
    this.collection.docs.set(this.id, data);
  }

  async delete(): Promise<void> {
    this.collection.docs.delete(this.id);
  }
}

class FakeCollection {
  readonly docs = new Map<string, DocumentData>();

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this, id);
  }

  where(field: string, op: "<=", value: Timestamp) {
    if (op !== "<=") throw new Error(`FakeCollection only supports "<=", got ${op}`);

    return {
      get: async () => ({
        docs: [...this.docs.entries()]
          .filter(([, data]) => {
            const fieldValue = data[field];
            return fieldValue instanceof Timestamp && fieldValue.toMillis() <= value.toMillis();
          })
          .map(([id, data]) => ({ data: () => data, ref: this.doc(id) })),
      }),
    };
  }
}

class FakeFirestore {
  private readonly collections = new Map<string, FakeCollection>();

  collection(name: string): FakeCollection {
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new FakeCollection();
      this.collections.set(name, collection);
    }
    return collection;
  }
}

defineSessionStoreContract("FirestoreSessionStore", () => new FirestoreSessionStore(new FakeFirestore() as unknown as Firestore));

describe("FirestoreSessionStore — Firestore-specific behaviour", () => {
  let db: FakeFirestore;
  let store: FirestoreSessionStore;

  beforeEach(() => {
    db = new FakeFirestore();
    store = new FirestoreSessionStore(db as unknown as Firestore);
  });

  test("expiresAt is stored as a Firestore Timestamp, not a plain number", async () => {
    const id = generateSessionId();
    const expiresAt = Date.now() + 60_000;
    await store.create({ id, createdAt: Date.now(), expiresAt, payment: { status: "unpaid" } });

    const stored = db.collection("sessions").docs.get(id)!;
    assert.ok(stored.expiresAt instanceof Timestamp);
    assert.equal(stored.expiresAt.toMillis(), expiresAt);
  });

  test("optional fields absent from a record are not written as undefined", async () => {
    const id = generateSessionId();
    await store.create({
      id,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      payment: { status: "unpaid" },
    });

    const stored = db.collection("sessions").docs.get(id)!;
    assert.equal("upload" in stored, false);
    assert.equal("specialtyId" in stored, false);
    assert.equal("paidAt" in stored.payment, false);
  });

  test("purgeExpired compares against the Firestore Timestamp field", async () => {
    const liveId = generateSessionId();
    const expiredId = generateSessionId();
    const now = Date.now();

    await store.create({ id: liveId, createdAt: now, expiresAt: now + 60_000, payment: { status: "unpaid" } });
    await store.create({ id: expiredId, createdAt: now, expiresAt: now - 1, payment: { status: "unpaid" } });

    assert.equal(await store.purgeExpired(now), 1);
    assert.equal(db.collection("sessions").docs.has(expiredId), false);
    assert.equal(db.collection("sessions").docs.has(liveId), true);
  });
});
