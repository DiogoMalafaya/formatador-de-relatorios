import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { InMemoryObjectStore } from "./store.ts";

describe("InMemoryObjectStore", () => {
  let store: InMemoryObjectStore;

  beforeEach(() => {
    store = new InMemoryObjectStore();
  });

  test("round-trips an object", async () => {
    const data = Buffer.from("conteúdo do currículo");
    await store.put("session-a/upload.docx", data, "application/vnd.openxmlformats");

    assert.deepEqual(await store.get("session-a/upload.docx"), data);
  });

  test("returns null for an unknown key", async () => {
    assert.equal(await store.get("missing"), null);
  });

  test("put reports size and content type", async () => {
    const data = Buffer.from("abc");
    const meta = await store.put("k", data, "text/plain");

    assert.equal(meta.sizeBytes, 3);
    assert.equal(meta.contentType, "text/plain");
    assert.equal(meta.key, "k");
  });

  test("objects are isolated by key, keyed by session", async () => {
    await store.put("session-a/upload.docx", Buffer.from("a"), "text/plain");
    await store.put("session-b/upload.docx", Buffer.from("b"), "text/plain");

    assert.deepEqual(await store.get("session-a/upload.docx"), Buffer.from("a"));
    assert.deepEqual(await store.get("session-b/upload.docx"), Buffer.from("b"));
  });

  test("returned bytes are a copy, not a reference to stored data", async () => {
    await store.put("k", Buffer.from("original"), "text/plain");

    const fetched = (await store.get("k"))!;
    fetched.write("mutated");

    assert.deepEqual(await store.get("k"), Buffer.from("original"));
  });

  test("put replaces an existing object at the same key", async () => {
    await store.put("k", Buffer.from("first"), "text/plain");
    await store.put("k", Buffer.from("second"), "text/plain");

    assert.deepEqual(await store.get("k"), Buffer.from("second"));
  });

  test("delete removes an object", async () => {
    await store.put("k", Buffer.from("x"), "text/plain");
    await store.delete("k");

    assert.equal(await store.get("k"), null);
  });

  describe("expiry", () => {
    test("an expired object reads as absent", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      // Reach past the store's internal state to simulate the clock moving —
      // mirrors the approach in the session store's own expiry tests.
      (store as unknown as { objects: Map<string, { expiresAt: number }> }).objects.get("k")!.expiresAt =
        Date.now() - 1;

      assert.equal(await store.get("k"), null);
    });

    test("reading an expired object drops it", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      (store as unknown as { objects: Map<string, { expiresAt: number }> }).objects.get("k")!.expiresAt =
        Date.now() - 1;

      await store.get("k");
      assert.equal(store.size, 0);
    });

    test("purgeExpired removes only expired objects", async () => {
      await store.put("live", Buffer.from("x"), "text/plain");
      await store.put("expired", Buffer.from("x"), "text/plain");
      (store as unknown as { objects: Map<string, { expiresAt: number }> }).objects.get("expired")!.expiresAt =
        Date.now() - 1;

      assert.equal(await store.purgeExpired(), 1);
      assert.equal(store.size, 1);
      assert.notEqual(await store.get("live"), null);
    });
  });

  describe("getSignedUrl", () => {
    test("null for a missing object", async () => {
      assert.equal(await store.getSignedUrl("missing", 300), null);
    });

    test("null for an expired object", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      (store as unknown as { objects: Map<string, { expiresAt: number }> }).objects.get("k")!.expiresAt =
        Date.now() - 1;

      assert.equal(await store.getSignedUrl("k", 300), null);
    });

    test("returns a URL scoped to the requested key", async () => {
      await store.put("session-a/preview.pdf", Buffer.from("x"), "application/pdf");
      const url = await store.getSignedUrl("session-a/preview.pdf", 300);

      assert.ok(url);
      assert.match(url!, /^memory:\/\//);
      assert.ok(url!.includes(encodeURIComponent("session-a/preview.pdf")));
    });

    test("a signed URL never outlives the object's own retention expiry", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      const objectExpiresAt = (
        store as unknown as { objects: Map<string, { expiresAt: number }> }
      ).objects.get("k")!.expiresAt;

      // Ask for a URL that would outlive the object by a wide margin.
      const url = await store.getSignedUrl("k", 365 * 24 * 60 * 60);
      const requestedExpiry = Number(new URL(url!).searchParams.get("exp"));

      assert.ok(requestedExpiry <= objectExpiresAt);
    });

    test("short-horizon URL expiry is honoured when it is the tighter bound", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      const before = Date.now();

      const url = await store.getSignedUrl("k", 300);
      const requestedExpiry = Number(new URL(url!).searchParams.get("exp"));

      assert.ok(requestedExpiry <= before + 300_000 + 1000);
      assert.ok(requestedExpiry > before);
    });
  });
});
