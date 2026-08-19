/**
 * Ephemeral session model (DIO-7).
 *
 * There are no user accounts. A session is the only thing connecting one
 * student's upload → preview → Stripe payment → download, and it lives only as
 * long as the uploaded files do (DIO-6, DIO-16).
 *
 * Design rule that the security of the whole flow rests on: **the browser holds
 * a session id and nothing else.** Storage keys, payment state, and every other
 * fact live server-side in the record below. A token is a name, never a claim.
 */

/** Payment state. Only ever advanced by the Stripe webhook (DIO-15). */
export type PaymentStatus = "unpaid" | "paid";

export interface UploadRef {
  /** Object-storage key of the uploaded .docx (DIO-6). */
  storageKey: string;
  /** Original filename, kept only to name the download sensibly. */
  originalFilename: string;
  sizeBytes: number;
}

export interface RenderedArtifacts {
  /** Watermarked preview, servable before payment (DIO-13). */
  previewStorageKey?: string;
  /** Clean PDF. Never served while payment.status is "unpaid" (DIO-15). */
  finalStorageKey?: string;
}

export interface SessionRecord {
  id: string;
  createdAt: number;
  /** Epoch ms. Matches the retention window enforced on the files themselves. */
  expiresAt: number;

  upload?: UploadRef;
  /** Specialty id from the config in DIO-9. */
  specialtyId?: string;
  /** Cover template id from DIO-12. */
  coverId?: string;

  payment: {
    status: PaymentStatus;
    stripeCheckoutSessionId?: string;
    paidAt?: number;
  };

  artifacts?: RenderedArtifacts;
}

/**
 * Persistence for session records.
 *
 * Deliberately narrow so the backing store can change without touching callers.
 * See `store.ts` for why the in-memory implementation must not reach production.
 */
export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  /** Returns null for unknown *and* expired sessions — expiry is enforced on read. */
  get(id: string): Promise<SessionRecord | null>;
  /**
   * Apply a partial update. `id`, `createdAt` and `expiresAt` are not updatable:
   * letting a caller push `expiresAt` outward would quietly defeat the retention
   * guarantee, which PRD §9 lists as never-cut.
   */
  update(
    id: string,
    patch: Partial<Omit<SessionRecord, "id" | "createdAt" | "expiresAt">>,
  ): Promise<SessionRecord | null>;
  delete(id: string): Promise<void>;
  /** Drop expired records. Backstop for the scheduled purge in DIO-16. */
  purgeExpired(now?: number): Promise<number>;
}
