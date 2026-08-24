import { getStorage } from "firebase-admin/storage";
import { getFirebaseApp } from "../firebase-app.ts";
import { OBJECT_TTL_MS } from "./types.ts";
import type { ObjectStore, StoredObjectMeta } from "./types.ts";

/**
 * Derived from the SDK's own return types rather than imported from
 * `@google-cloud/storage` directly — `firebase-admin` bundles its own nested
 * copy of that package, and importing the top-level one produces a second,
 * structurally-incompatible `Bucket` type.
 */
export type FirebaseBucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;
type FirebaseFile = ReturnType<FirebaseBucket["file"]>;
type FileCustomMetadata = Record<string, string | number | boolean | null | undefined>;

/**
 * Firebase Storage-backed object store (DIO-6 production backend).
 *
 * Retention is enforced twice, per the ticket's decision thread: the bucket's
 * own lifecycle rule ("age 1 day", set in the GCP console — Firebase does not
 * expose lifecycle rules) is a backstop with no timing guarantee, while
 * `expiresAt` carried in each object's custom metadata is the guarantee this
 * class actually honours on every read.
 */
export class FirebaseObjectStore implements ObjectStore {
  private readonly bucket: FirebaseBucket;

  constructor(bucket: FirebaseBucket = getConfiguredBucket()) {
    this.bucket = bucket;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObjectMeta> {
    const now = Date.now();
    const expiresAt = now + OBJECT_TTL_MS;

    await this.bucket.file(key).save(data, {
      contentType,
      resumable: false,
      // Never publicly cacheable — reads only ever happen through a signed URL.
      metadata: {
        contentType,
        cacheControl: "no-store",
        metadata: { expiresAt: String(expiresAt), createdAt: String(now) },
      },
    });

    return { key, contentType, sizeBytes: data.byteLength, createdAt: now, expiresAt };
  }

  async get(key: string): Promise<Buffer | null> {
    const meta = await this.readLiveMeta(key);
    if (!meta) return null;

    const [data] = await this.bucket.file(key).download();
    return data;
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string | null> {
    const meta = await this.readLiveMeta(key);
    if (!meta) return null;

    // A signed URL must never outlive the object it points at.
    const urlExpiresAt = Math.min(Date.now() + ttlSeconds * 1000, meta.expiresAt);
    const [url] = await this.bucket.file(key).getSignedUrl({ action: "read", expires: urlExpiresAt });
    return url;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }

  async purgeExpired(now: number = Date.now()): Promise<number> {
    const [files] = await this.bucket.getFiles();
    let purged = 0;

    await Promise.all(
      files.map(async (file: FirebaseFile) => {
        const [metadata] = await file.getMetadata();
        const expiresAt = Number((metadata.metadata as FileCustomMetadata | undefined)?.expiresAt);
        if (!expiresAt || expiresAt > now) return;

        await file.delete({ ignoreNotFound: true });
        purged += 1;
      }),
    );

    return purged;
  }

  /**
   * Reads custom metadata and enforces expiry on the read path, same as
   * `InMemoryObjectStore` — an object must never be served past its retention
   * window even if the bucket lifecycle rule or the purge job runs late.
   */
  private async readLiveMeta(key: string): Promise<{ expiresAt: number } | null> {
    const file = this.bucket.file(key);
    let customMetadata: FileCustomMetadata | undefined;
    try {
      const [metadata] = await file.getMetadata();
      customMetadata = metadata.metadata as FileCustomMetadata | undefined;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }

    const expiresAt = Number(customMetadata?.expiresAt);
    if (!expiresAt) return null;

    if (expiresAt <= Date.now()) {
      await file.delete({ ignoreNotFound: true });
      return null;
    }
    return { expiresAt };
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 404;
}

/** Builds the Admin SDK bucket handle from the shared Firebase app. */
function getConfiguredBucket(): FirebaseBucket {
  return getStorage(getFirebaseApp()).bucket();
}
