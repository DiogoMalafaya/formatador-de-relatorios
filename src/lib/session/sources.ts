import type { SessionRecord, SourceFileRef } from "./types.ts";

/**
 * Multi-file source handling (DIO-40).
 *
 * A CV is assembled from a documento principal plus N chapter files, all
 * stored as `{sessionId}/source/{index}.docx`. Three rules everything here
 * enforces:
 *
 * 1. **Order and master-designation are server-side session state.** The
 *    browser proposes changes through the API routes; at render time nothing
 *    is ever taken from the client.
 * 2. **`index` is a stable upload-sequence number, not the chapter order.**
 *    It is baked into the storage key at upload time and never changes, so
 *    reordering is a pure permutation of the record's `sources` array and no
 *    stored object is ever renamed or copied.
 * 3. **A single uploaded file is source 0 and automatically the master** —
 *    the degenerate case behaves exactly like the original single-file flow.
 *
 * The pure `apply*` helpers below return a value or an `error` code and
 * never touch storage or the session store; the API routes own the I/O and
 * the pt-PT copy. That keeps them testable on Node's bare test runner.
 */

/** Storage key for one uploaded source document (DIO-6 key layout). */
export function sourceStorageKey(sessionId: string, index: number): string {
  return `${sessionId}/source/${index}.docx`;
}

/**
 * The session's source documents in chapter order.
 *
 * Every reader of uploaded files goes through here — it is the single place
 * that also understands the legacy single-file `upload` shape (treated as
 * source 0), so the render pipeline never needs to know two layouts exist.
 */
export function getOrderedSources(record: SessionRecord): SourceFileRef[] {
  if (record.sources) return record.sources;

  if (record.upload) {
    return [
      {
        index: 0,
        storageKey: record.upload.storageKey,
        originalFilename: record.upload.originalFilename,
        sizeBytes: record.upload.sizeBytes,
      },
    ];
  }

  return [];
}

/**
 * The documento principal, or null when nothing has been uploaded.
 *
 * Falls back to the first source in chapter order if `masterIndex` is
 * missing or stale — a session must never become unrenderable because of a
 * dangling designation.
 */
export function getMasterSource(record: SessionRecord): SourceFileRef | null {
  const sources = getOrderedSources(record);
  if (sources.length === 0) return null;

  return sources.find((source) => source.index === record.masterIndex) ?? sources[0];
}

/** Combined size of all stored sources, for the collection-level cap. */
export function combinedSourceBytes(record: SessionRecord): number {
  return getOrderedSources(record).reduce((sum, source) => sum + source.sizeBytes, 0);
}

/**
 * Next stable index for a new upload: one past the highest ever used, so an
 * index (and therefore a storage key) is never reused after a removal.
 */
export function nextSourceIndex(sources: SourceFileRef[]): number {
  return sources.reduce((max, source) => Math.max(max, source.index + 1), 0);
}

/** Machine-readable failure; the API route owns the pt-PT wording. */
export type SourceMutationError = "no_sources" | "unknown_index" | "invalid_order";

export type SourceMutationResult =
  | { ok: true; sources: SourceFileRef[]; masterIndex: number | undefined; removed?: SourceFileRef }
  | { ok: false; error: SourceMutationError };

/**
 * Reorder the chapters. `order` must be exactly a permutation of the current
 * stable indexes — anything else (unknown index, duplicate, wrong length) is
 * rejected outright rather than partially applied. `masterIndex` is a stable
 * index, so it survives any reorder untouched.
 */
export function applyReorder(record: SessionRecord, order: number[]): SourceMutationResult {
  const sources = getOrderedSources(record);
  if (sources.length === 0) return { ok: false, error: "no_sources" };

  const byIndex = new Map(sources.map((source) => [source.index, source]));
  if (order.length !== sources.length || new Set(order).size !== order.length) {
    return { ok: false, error: "invalid_order" };
  }

  const reordered: SourceFileRef[] = [];
  for (const index of order) {
    const source = byIndex.get(index);
    if (!source) return { ok: false, error: "invalid_order" };
    reordered.push(source);
  }

  return { ok: true, sources: reordered, masterIndex: normalizedMasterIndex(reordered, record.masterIndex) };
}

/** Designate the documento principal by its stable index. */
export function applySetMaster(record: SessionRecord, index: number): SourceMutationResult {
  const sources = getOrderedSources(record);
  if (sources.length === 0) return { ok: false, error: "no_sources" };
  if (!sources.some((source) => source.index === index)) {
    return { ok: false, error: "unknown_index" };
  }

  return { ok: true, sources, masterIndex: index };
}

/**
 * Remove one source by its stable index. If the removed file was the master,
 * the designation falls back to the first remaining chapter — never to a
 * dangling index. The caller must also delete `removed.storageKey` from
 * object storage (best-effort: the TTL/purge regime covers a failed delete).
 */
export function applyRemoveSource(record: SessionRecord, index: number): SourceMutationResult {
  const sources = getOrderedSources(record);
  const removed = sources.find((source) => source.index === index);
  if (!removed) {
    return { ok: false, error: sources.length === 0 ? "no_sources" : "unknown_index" };
  }

  const remaining = sources.filter((source) => source.index !== index);
  return {
    ok: true,
    sources: remaining,
    masterIndex: normalizedMasterIndex(remaining, record.masterIndex),
    removed,
  };
}

/** Master designation with dangling references healed, undefined when empty. */
function normalizedMasterIndex(
  sources: SourceFileRef[],
  masterIndex: number | undefined,
): number | undefined {
  if (sources.length === 0) return undefined;
  if (masterIndex !== undefined && sources.some((source) => source.index === masterIndex)) {
    return masterIndex;
  }
  return sources[0].index;
}

/**
 * What the browser is allowed to know about the source list. Deliberately
 * excludes storage keys: the browser holds a session id and nothing else
 * (DIO-7), and keys would be a claim about server-side layout it never needs.
 */
export interface ClientSourceFile {
  index: number;
  originalFilename: string;
  sizeBytes: number;
  isMaster: boolean;
}

export function toClientSources(record: SessionRecord): {
  sources: ClientSourceFile[];
  masterIndex: number | null;
} {
  const master = getMasterSource(record);
  return {
    sources: getOrderedSources(record).map((source) => ({
      index: source.index,
      originalFilename: source.originalFilename,
      sizeBytes: source.sizeBytes,
      isMaster: source.index === master?.index,
    })),
    masterIndex: master ? master.index : null,
  };
}
