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
import type { CoverDetails } from "../covers/details.ts";
export type PaymentStatus = "unpaid" | "paid";

export interface UploadRef {
  /** Object-storage key of the uploaded .docx (DIO-6). */
  storageKey: string;
  /** Original filename, kept only to name the download sensibly. */
  originalFilename: string;
  sizeBytes: number;
}

/**
 * One uploaded source document of a multi-file CV (DIO-40).
 *
 * A CV is assembled from a *documento principal* (cover/dedication/front
 * matter) plus N chapter files. Each upload gets a stable `index` — a
 * monotonically increasing counter baked into the storage key
 * (`{sessionId}/source/{index}.docx`) — that never changes afterwards.
 * Chapter *order* is the array order of `SessionRecord.sources`, so
 * reordering permutes the array and never renames stored objects.
 */
export interface SourceFileRef {
  /** Stable upload-sequence number; also appears in `storageKey`. Not the chapter order. */
  index: number;
  /** Object-storage key: `{sessionId}/source/{index}.docx` (DIO-6). */
  storageKey: string;
  /** Original filename, shown back to the student in the wizard only. */
  originalFilename: string;
  sizeBytes: number;
}

export interface RenderedArtifacts {
  /** Watermarked preview, servable before payment (DIO-13). */
  previewStorageKey?: string;
  /** Clean PDF. Never served while payment.status is "unpaid" (DIO-15). */
  finalStorageKey?: string;
  /**
   * Exact-count validations from the last paginated render (DIO-42): the
   * 80-page and resumo checks that only exist once a real page map does. The
   * warnings route serves these alongside the parse-time warnings and drops
   * the page-count *estimate* when an exact count is available. Re-written on
   * every preview render, cleared when the last render wasn't paginated —
   * never older than the newest preview. Codes + pt-PT copy only, never
   * document content.
   */
  renderWarnings?: { code: string; messagePt: string; sourceFilename?: string }[];
  /** Exact page count of the last paginated render (DIO-42). */
  renderedPageCount?: number;
  /** Whether that render had chapter dividers on (DIO-54), so the page budget can adjust for a toggle since. */
  renderedWithDividers?: boolean;
  /** Pages chapter dividers add to that render's document (DIO-54). */
  dividerPageCost?: number;
  /**
   * `renderInputsKey` of the session when that render ran (DIO-54): the
   * page count only counts while the inputs still match. A hash, never the
   * inputs themselves.
   */
  renderInputsKey?: string;
}

export interface SessionRecord {
  id: string;
  createdAt: number;
  /** Epoch ms. Matches the retention window enforced on the files themselves. */
  expiresAt: number;

  /**
   * @deprecated Single-file predecessor of `sources` (DIO-40). No longer
   * written; still read as a fallback by `getOrderedSources` so anything
   * created before the multi-file cutover keeps working for the rest of its
   * (short) life. Remove once nothing constructs it any more.
   */
  upload?: UploadRef;
  /**
   * Uploaded source documents, in chapter order (DIO-40). Array order *is*
   * the order the merge pipeline consumes; it lives here, server-side, and is
   * never client-asserted at render time. Read through
   * `src/lib/session/sources.ts` rather than directly — the helper also
   * covers the legacy `upload` shape.
   */
  sources?: SourceFileRef[];
  /**
   * Stable `SourceFileRef.index` of the documento principal — *not* a
   * position in the `sources` array, so reordering chapters never silently
   * changes which file supplies the front matter. A single uploaded file is
   * automatically the master (the degenerate case is today's behaviour).
   */
  masterIndex?: number;
  /** Specialty id from the config in DIO-9. */
  specialtyId?: string;
  /** Cover template id from DIO-12. */
  coverId?: string;
  /** House theme id (DIO-56). Unset means the default theme; the profile constrains it either way. */
  themeId?: string;
  /**
   * Local de formação, signatories and an optional name override for the
   * cover and página de rosto (DIO-50). Personal data: expires with the record.
   */
  coverDetails?: CoverDetails;
  /**
   * Guided setup wizard progress (DIO-37): 1 = upload, 2 = specialty,
   * 3 = cover, 4 = review. UI convenience so a refresh restores the current
   * step — routes must keep validating the record itself (upload, specialty,
   * cover presence), never trust this number for anything.
   */
  setupStep?: number;
  /**
   * A divider page before every chapter (DIO-54, PRD US7). Off unless the
   * student turns it on in the workspace.
   */
  chapterDividers?: boolean;
  /**
   * Outer-edge chapter tabs for the printed CV (DIO-58). Off unless the
   * student turns them on; only print-delivered profiles draw them.
   */
  chapterTabs?: boolean;

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
