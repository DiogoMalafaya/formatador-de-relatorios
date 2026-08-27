/**
 * Ephemeral object storage (DIO-6).
 *
 * Holds the uploaded `.docx`, the watermarked preview PDF (DIO-13), and the
 * final clean PDF (DIO-15) — all keyed by session id (DIO-7), all gone by the
 * same clock the session record itself expires on. PRD §9 lists the deletion
 * guarantee as never-cut, so expiry is enforced at the store level as a
 * backstop to the bucket lifecycle rule, not layered on afterwards.
 */

/**
 * Retention window for stored objects — the purge threshold, not the public
 * promise.
 *
 * Must stay equal to `SESSION_TTL_MS` in `src/lib/session/index.ts` — the two
 * clocks are the same guarantee expressed twice. Set to 22h (DIO-6 comment
 * thread, 2026-08-20): the public promise is 48h (Vercel Hobby's daily cron
 * plus day-granularity bucket lifecycle rules add up to ~24h of slop on top
 * of whatever threshold is swept), and the threshold has to be the smaller
 * number so the promise is never quietly broken. 22h leaves margin for cron
 * scheduling slop.
 */
export const OBJECT_TTL_MS = 22 * 60 * 60 * 1000;

/**
 * The public retention promise (DIO-19's privacy policy quotes this
 * directly, rather than a bare "48"), kept apart from `OBJECT_TTL_MS` above
 * since it's a rounded external commitment, not the internal threshold
 * itself — see `types.test.mts` for the guard that keeps the two honest.
 */
export const PUBLIC_RETENTION_HOURS = 48;

export interface StoredObjectMeta {
  key: string;
  contentType: string;
  sizeBytes: number;
  createdAt: number;
  /** Epoch ms. Matches the session's own expiry (DIO-7) for any given upload. */
  expiresAt: number;
}

export interface ObjectStore {
  /** Writes `data` under `key`, replacing any existing object there. */
  put(key: string, data: Buffer, contentType: string): Promise<StoredObjectMeta>;
  /**
   * A short-lived, unguessable URL to read the object — never a public or
   * listable path. Null if the object does not exist or has expired.
   *
   * `ttlSeconds` is the URL's own lifetime and is independent of, and always
   * capped by, the object's retention expiry: a signed URL must never outlive
   * the object it points at.
   */
  getSignedUrl(key: string, ttlSeconds: number): Promise<string | null>;
  /** Raw bytes for server-side use (e.g. handing the `.docx` to the parser in DIO-10). */
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** Drop expired objects. Backstop for the bucket lifecycle rule and the scheduled purge in DIO-16. */
  purgeExpired(now?: number): Promise<number>;
}
