import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FirebaseObjectStore } from "./firebase-store.ts";
import type { FirebaseBucket } from "./firebase-store.ts";
import { OBJECT_TTL_MS } from "./types.ts";

/**
 * A hand-rolled double for the tiny slice of the Admin SDK's `Bucket`/`File`
 * API `FirebaseObjectStore` actually calls. Lets the expiry, capping and
 * not-found logic be exercised without a real Firebase project or network
 * access — the live bucket is instead exercised by a manual smoke test (see
 * the DIO-6 ticket for the run log), since round-tripping actual GCS calls in
 * the automated suite would make `npm test` depend on live credentials.
 */
interface FakeFileRecord {
  data: Buffer;
  metadata: { contentType?: string; metadata?: Record<string, string> };
}

class FakeFile {
  private readonly bucket: FakeBucket;
  private readonly key: string;

  constructor(bucket: FakeBucket, key: string) {
    this.bucket = bucket;
    this.key = key;
  }

  async save(data: Buffer, options: { metadata?: FakeFileRecord["metadata"] }): Promise<void> {
    this.bucket.files.set(this.key, { data: Buffer.from(data), metadata: options.metadata ?? {} });
  }

  async download(): Promise<[Buffer]> {
    const record = this.require();
    return [record.data];
  }

  async getMetadata(): Promise<[FakeFileRecord["metadata"]]> {
    const record = this.require();
    return [record.metadata];
  }

  async getSignedUrl(options: { action: "read"; expires: number }): Promise<[string]> {
    return [`https://fake-signed-url.test/${encodeURIComponent(this.key)}?exp=${options.expires}`];
  }

  async delete(): Promise<void> {
    this.bucket.files.delete(this.key);
  }

  private require(): FakeFileRecord {
    const record = this.bucket.files.get(this.key);
    if (!record) {
      const error = new Error("not found") as Error & { code: number };
      error.code = 404;
      throw error;
    }
    return record;
  }
}

class FakeBucket {
  readonly files = new Map<string, FakeFileRecord>();

  file(key: string): FakeFile {
    return new FakeFile(this, key);
  }

  async getFiles(): Promise<[FakeFile[]]> {
    return [[...this.files.keys()].map((key) => this.file(key))];
  }
}

describe("FirebaseObjectStore", () => {
  let bucket: FakeBucket;
  let store: FirebaseObjectStore;

  beforeEach(() => {
    bucket = new FakeBucket();
    store = new FirebaseObjectStore(bucket as unknown as FirebaseBucket);
  });

  test("round-trips an object", async () => {
    await store.put("session-a/upload.docx", Buffer.from("conteúdo"), "application/vnd.openxmlformats");

    assert.deepEqual(await store.get("session-a/upload.docx"), Buffer.from("conteúdo"));
  });

  test("returns null for an unknown key", async () => {
    assert.equal(await store.get("missing"), null);
  });

  test("put reports size, content type and a TTL-bound expiry", async () => {
    const meta = await store.put("k", Buffer.from("abc"), "text/plain");

    assert.equal(meta.sizeBytes, 3);
    assert.equal(meta.contentType, "text/plain");
    assert.equal(meta.key, "k");
    assert.equal(meta.expiresAt - meta.createdAt, OBJECT_TTL_MS);
  });

  test("delete removes an object", async () => {
    await store.put("k", Buffer.from("x"), "text/plain");
    await store.delete("k");

    assert.equal(await store.get("k"), null);
  });

  test("delete on a missing key does not throw", async () => {
    await assert.doesNotReject(store.delete("missing"));
  });

  describe("expiry", () => {
    test("an expired object reads as absent", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      bucket.files.get("k")!.metadata.metadata!.expiresAt = String(Date.now() - 1);

      assert.equal(await store.get("k"), null);
    });

    test("reading an expired object deletes it from the bucket", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      bucket.files.get("k")!.metadata.metadata!.expiresAt = String(Date.now() - 1);

      await store.get("k");
      assert.equal(bucket.files.has("k"), false);
    });

    test("purgeExpired removes only expired objects", async () => {
      await store.put("live", Buffer.from("x"), "text/plain");
      await store.put("expired", Buffer.from("x"), "text/plain");
      bucket.files.get("expired")!.metadata.metadata!.expiresAt = String(Date.now() - 1);

      assert.equal(await store.purgeExpired(), 1);
      assert.equal(bucket.files.has("expired"), false);
      assert.equal(bucket.files.has("live"), true);
    });
  });

  describe("getSignedUrl", () => {
    test("null for a missing object", async () => {
      assert.equal(await store.getSignedUrl("missing", 300), null);
    });

    test("null for an expired object", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      bucket.files.get("k")!.metadata.metadata!.expiresAt = String(Date.now() - 1);

      assert.equal(await store.getSignedUrl("k", 300), null);
    });

    test("returns a URL scoped to the requested key", async () => {
      await store.put("session-a/preview.pdf", Buffer.from("x"), "application/pdf");
      const url = await store.getSignedUrl("session-a/preview.pdf", 300);

      assert.ok(url);
      assert.ok(url!.includes(encodeURIComponent("session-a/preview.pdf")));
    });

    test("a signed URL never outlives the object's own retention expiry", async () => {
      await store.put("k", Buffer.from("x"), "text/plain");
      const objectExpiresAt = Number(bucket.files.get("k")!.metadata.metadata!.expiresAt);

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
