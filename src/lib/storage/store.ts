import { createHmac, randomBytes } from "node:crypto";
import { FirebaseObjectStore } from "./firebase-store.ts";
import { OBJECT_TTL_MS } from "./types.ts";
import type { ObjectStore, StoredObjectMeta } from "./types.ts";

export { OBJECT_TTL_MS } from "./types.ts";
export { FirebaseObjectStore } from "./firebase-store.ts";

interface StoredObject extends StoredObjectMeta {
  data: Buffer;
}

/**
 * In-memory object store.
 *
 * **Development and test only — this must never back production.** State is
 * lost on restart and is not shared between instances, which would strand a
 * paid student's rendered PDF on the wrong instance. Same failure mode as
 * `InMemorySessionStore` (DIO-7), for the same reason.
 *
 * `getSignedUrl` fabricates a `memory://` URL for shape-testing only — it is
 * never actually servable. It exists so callers can be written and tested
 * against the real interface before a production backend exists.
 */
export class InMemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObjectMeta> {
    const now = Date.now();
    const stored: StoredObject = {
      key,
      data: Buffer.from(data),
      contentType,
      sizeBytes: data.byteLength,
      createdAt: now,
      expiresAt: now + OBJECT_TTL_MS,
    };
    this.objects.set(key, stored);
    return toMeta(stored);
  }

  async get(key: string): Promise<Buffer | null> {
    const object = this.read(key);
    return object ? Buffer.from(object.data) : null;
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string | null> {
    const object = this.read(key);
    if (!object) return null;

    // A signed URL must never outlive the object it points at.
    const urlExpiresAt = Math.min(Date.now() + ttlSeconds * 1000, object.expiresAt);
    const signature = createHmac("sha256", DEV_URL_SECRET)
      .update(`${key}.${urlExpiresAt}`)
      .digest("base64url");

    return `memory://${encodeURIComponent(key)}?exp=${urlExpiresAt}&sig=${signature}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async purgeExpired(now: number = Date.now()): Promise<number> {
    let purged = 0;
    for (const [key, object] of this.objects) {
      if (object.expiresAt <= now) {
        this.objects.delete(key);
        purged += 1;
      }
    }
    return purged;
  }

  /** Test helper. Not part of the ObjectStore contract. */
  get size(): number {
    return this.objects.size;
  }

  private read(key: string): StoredObject | undefined {
    const object = this.objects.get(key);
    if (!object) return undefined;

    // Expiry is enforced on read as well as by purgeExpired, so an object can
    // never be served past its retention window even if the purge is late.
    if (object.expiresAt <= Date.now()) {
      this.objects.delete(key);
      return undefined;
    }
    return object;
  }
}

function toMeta(object: StoredObject): StoredObjectMeta {
  return {
    key: object.key,
    contentType: object.contentType,
    sizeBytes: object.sizeBytes,
    createdAt: object.createdAt,
    expiresAt: object.expiresAt,
  };
}

/** Process-local, dev-only — signing a URL that is never actually served over HTTP. */
const DEV_URL_SECRET = randomBytes(32).toString("hex");

/**
 * Builds the store for the current environment.
 *
 * Production uses Firebase Storage (per the DIO-5/DIO-6 hosting decision) via
 * `FirebaseObjectStore`. `FirebaseObjectStore` reads its own required secrets
 * and throws a clear "missing environment variable" error if they are absent,
 * so a misconfigured deploy fails loudly rather than silently falling back to
 * `InMemoryObjectStore` — which loses state on restart and is not shared
 * between instances, either of which would strand a paid student's rendered
 * PDF.
 *
 * `FirebaseObjectStore` is imported statically, but reaches the Admin SDK's
 * credential-reading code only at construction time, not at module load — so
 * this stays safe for `next build`, which runs with `NODE_ENV=production` but
 * no deploy secrets.
 */
export function createObjectStore(): ObjectStore {
  if (process.env.NODE_ENV === "production") {
    return new FirebaseObjectStore();
  }
  return new InMemoryObjectStore();
}
