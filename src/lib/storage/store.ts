import { createHmac, randomBytes } from "node:crypto";
import type { ObjectStore, StoredObjectMeta } from "./types";

/**
 * Retention window for stored objects.
 *
 * Must stay equal to `SESSION_TTL_MS` in `src/lib/session/index.ts` — the two
 * clocks are the same guarantee expressed twice. Confirmed 24h (DIO-6 comment
 * thread, 2026-08-19): the flow is single-sitting, so a longer window adds
 * privacy exposure without adding user value.
 */
export const OBJECT_TTL_MS = 24 * 60 * 60 * 1000;

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
 * Throws in production rather than falling back to the in-memory store: an
 * outage is recoverable, silently losing a paid student's document is not.
 *
 * The production backend (Firebase Storage, per the DIO-5/DIO-6 hosting
 * decision) is not implemented here — same as `createSessionStore` (DIO-7),
 * which defers its own backend choice. Building it against unverifiable
 * credentials would ship untested code on the path that has to hold a
 * "no charging without delivering" guarantee; see the DIO-6 comment thread.
 */
export function createObjectStore(): ObjectStore {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No production object store is configured. InMemoryObjectStore loses " +
        "state on restart and is not shared between instances, which would " +
        "strand a paid student's rendered PDF. Configure Firebase Storage " +
        "before deploying.",
    );
  }
  return new InMemoryObjectStore();
}
