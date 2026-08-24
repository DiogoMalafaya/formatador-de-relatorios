import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { generateSessionId } from "./token.ts";
import type { SessionRecord, SessionStore } from "./types.ts";

const HOUR = 60 * 60 * 1000;

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = Date.now();
  return {
    id: generateSessionId(),
    createdAt: now,
    expiresAt: now + 24 * HOUR,
    payment: { status: "unpaid" },
    ...overrides,
  };
}

/**
 * Contract every `SessionStore` implementation must satisfy — run against both
 * `InMemorySessionStore` (store.test.mts) and `FirestoreSessionStore`
 * (firestore-store.test.mts) so a Firestore-specific bug (Timestamp
 * conversion, undefined-field stripping) can't silently diverge from the
 * in-memory reference behaviour DIO-7 established.
 *
 * Deliberately avoids the in-memory store's `.size` test helper — it is
 * documented as "not part of the SessionStore contract" and Firestore has no
 * equivalent. Where the original suite used it to observe an internal
 * deletion, this asks the same question through the public interface instead
 * (a second read, or a follow-up `purgeExpired()`).
 */
export function defineSessionStoreContract(
  storeName: string,
  makeStore: () => SessionStore | Promise<SessionStore>,
) {
  describe(storeName, () => {
    let store: SessionStore;

    beforeEach(async () => {
      store = await makeStore();
    });

    test("round-trips a record", async () => {
      const record = makeRecord();
      await store.create(record);
      assert.deepEqual(await store.get(record.id), record);
    });

    test("returns null for an unknown id", async () => {
      assert.equal(await store.get(generateSessionId()), null);
    });

    // --- AC: "A valid token for session A cannot retrieve session B's files." ---

    test("sessions are isolated from one another", async () => {
      const a = makeRecord({ upload: { storageKey: "a/cv.docx", originalFilename: "a.docx", sizeBytes: 1 } });
      const b = makeRecord({ upload: { storageKey: "b/cv.docx", originalFilename: "b.docx", sizeBytes: 2 } });
      await store.create(a);
      await store.create(b);

      assert.equal((await store.get(a.id))?.upload?.storageKey, "a/cv.docx");
      assert.equal((await store.get(b.id))?.upload?.storageKey, "b/cv.docx");
    });

    test("stored records are isolated, so a caller cannot mutate them in place", async () => {
      const record = makeRecord();
      await store.create(record);

      const fetched = (await store.get(record.id))!;
      fetched.payment.status = "paid";

      // Payment state must only ever advance through the webhook path (DIO-15).
      assert.equal((await store.get(record.id))?.payment.status, "unpaid");
    });

    describe("update", () => {
      test("applies a partial patch", async () => {
        const record = makeRecord();
        await store.create(record);

        const updated = await store.update(record.id, { specialtyId: "mfr" });
        assert.equal(updated?.specialtyId, "mfr");
        assert.equal(updated?.payment.status, "unpaid");
      });

      test("returns null for an unknown id", async () => {
        assert.equal(await store.update(generateSessionId(), { coverId: "x" }), null);
      });

      test("cannot extend expiry", async () => {
        const record = makeRecord();
        await store.create(record);

        // A caller casting past the type would otherwise defeat the retention
        // guarantee that PRD §9 lists as never-cut.
        await store.update(record.id, {
          expiresAt: Date.now() + 365 * 24 * HOUR,
        } as never);

        assert.equal((await store.get(record.id))?.expiresAt, record.expiresAt);
      });

      test("cannot reassign the id or creation time", async () => {
        const record = makeRecord();
        await store.create(record);

        await store.update(record.id, { id: "hijacked", createdAt: 0 } as never);

        assert.equal(await store.get("hijacked"), null);
        assert.equal((await store.get(record.id))?.createdAt, record.createdAt);
      });
    });

    describe("expiry", () => {
      test("an expired session reads as absent", async () => {
        await store.create(makeRecord({ id: "expired", expiresAt: Date.now() - 1 }));
        assert.equal(await store.get("expired"), null);
      });

      test("reading an expired session drops it", async () => {
        await store.create(makeRecord({ id: "expired", expiresAt: Date.now() - 1 }));
        await store.get("expired");

        // The read path should have already deleted it, so a follow-up purge
        // finds nothing left to do.
        assert.equal(await store.purgeExpired(), 0);
      });

      test("purgeExpired removes only expired records", async () => {
        const live = makeRecord();
        await store.create(live);
        await store.create(makeRecord({ id: "expired-1", expiresAt: Date.now() - 1 }));
        await store.create(makeRecord({ id: "expired-2", expiresAt: Date.now() - 5 * HOUR }));

        assert.equal(await store.purgeExpired(), 2);
        assert.equal((await store.get(live.id))?.id, live.id);
        assert.equal(await store.get("expired-1"), null);
        assert.equal(await store.get("expired-2"), null);
      });

      test("a paid session expires on the same clock as an unpaid one", async () => {
        // D5: files are purged regardless of payment status. A paid session that
        // outlived its files would point at objects that no longer exist.
        await store.create(
          makeRecord({
            id: "paid-expired",
            expiresAt: Date.now() - 1,
            payment: { status: "paid", paidAt: Date.now() - HOUR },
          }),
        );
        assert.equal(await store.get("paid-expired"), null);
      });
    });

    test("delete removes a record", async () => {
      const record = makeRecord();
      await store.create(record);
      await store.delete(record.id);
      assert.equal(await store.get(record.id), null);
    });
  });
}
