import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  applyRemoveSource,
  applyReorder,
  applySetMaster,
  combinedSourceBytes,
  getMasterSource,
  getOrderedSources,
  nextSourceIndex,
  sourceStorageKey,
  toClientSources,
} from "./sources.ts";
import type { SessionRecord, SourceFileRef } from "./types.ts";

function ref(index: number, overrides: Partial<SourceFileRef> = {}): SourceFileRef {
  return {
    index,
    storageKey: sourceStorageKey("session-x", index),
    originalFilename: `ficheiro-${index}.docx`,
    sizeBytes: (index + 1) * 100,
    ...overrides,
  };
}

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = Date.now();
  return {
    id: "session-x",
    createdAt: now,
    expiresAt: now + 60_000,
    payment: { status: "unpaid" },
    ...overrides,
  };
}

describe("sourceStorageKey", () => {
  test("produces the DIO-40 layout", () => {
    assert.equal(sourceStorageKey("abc", 3), "abc/source/3.docx");
  });
});

describe("getOrderedSources", () => {
  test("returns the sources array in stored (chapter) order", () => {
    const sources = [ref(1), ref(0), ref(2)];
    assert.deepEqual(getOrderedSources(record({ sources })), sources);
  });

  test("empty session has no sources", () => {
    assert.deepEqual(getOrderedSources(record()), []);
  });

  // --- The single-file degenerate case: exactly today's behaviour ---

  test("a legacy single-upload record reads as source 0", () => {
    const legacy = record({
      upload: { storageKey: "session-x/upload.docx", originalFilename: "cv.docx", sizeBytes: 42 },
    });

    assert.deepEqual(getOrderedSources(legacy), [
      { index: 0, storageKey: "session-x/upload.docx", originalFilename: "cv.docx", sizeBytes: 42 },
    ]);
    // ...and it is automatically the master, even with no masterIndex stored.
    assert.equal(getMasterSource(legacy)?.storageKey, "session-x/upload.docx");
  });
});

describe("getMasterSource", () => {
  test("null when nothing was uploaded", () => {
    assert.equal(getMasterSource(record()), null);
  });

  test("a single uploaded file is automatically the master", () => {
    const single = record({ sources: [ref(0)] });
    assert.equal(getMasterSource(single)?.index, 0);
  });

  test("resolves by stable index, not array position", () => {
    const reordered = record({ sources: [ref(2), ref(0), ref(1)], masterIndex: 1 });
    assert.equal(getMasterSource(reordered)?.index, 1);
  });

  test("a stale designation falls back to the first chapter", () => {
    const stale = record({ sources: [ref(3), ref(4)], masterIndex: 99 });
    assert.equal(getMasterSource(stale)?.index, 3);
  });
});

describe("nextSourceIndex", () => {
  test("starts at 0", () => {
    assert.equal(nextSourceIndex([]), 0);
  });

  test("never reuses an index after a removal", () => {
    // 0 and 2 remain after 1 and 3 were removed; the next upload must not
    // resurrect key .../3.docx, whose object may still await purge.
    assert.equal(nextSourceIndex([ref(0), ref(2)]), 3);
  });
});

describe("combinedSourceBytes", () => {
  test("sums every stored source", () => {
    assert.equal(combinedSourceBytes(record({ sources: [ref(0), ref(1)] })), 300);
  });
});

describe("applyReorder", () => {
  const three = () => record({ sources: [ref(0), ref(1), ref(2)], masterIndex: 0 });

  test("permutes the chapter order and keeps the master designation", () => {
    const result = applyReorder(three(), [2, 0, 1]);
    assert.equal(result.ok, true);
    assert.deepEqual(
      (result as { sources: SourceFileRef[] }).sources.map((s) => s.index),
      [2, 0, 1],
    );
    // masterIndex is a stable index: moving chapters never changes which
    // file supplies the front matter.
    assert.equal((result as { masterIndex?: number }).masterIndex, 0);
  });

  test("rejects an order that is not a full permutation", () => {
    assert.deepEqual(applyReorder(three(), [0, 1]), { ok: false, error: "invalid_order" });
    assert.deepEqual(applyReorder(three(), [0, 1, 1]), { ok: false, error: "invalid_order" });
    assert.deepEqual(applyReorder(three(), [0, 1, 7]), { ok: false, error: "invalid_order" });
    assert.deepEqual(applyReorder(three(), [0, 1, 2, 3]), { ok: false, error: "invalid_order" });
  });

  test("rejects when nothing was uploaded", () => {
    assert.deepEqual(applyReorder(record(), []), { ok: false, error: "no_sources" });
  });
});

describe("applySetMaster", () => {
  test("designates by stable index", () => {
    const result = applySetMaster(record({ sources: [ref(0), ref(1)], masterIndex: 0 }), 1);
    assert.equal(result.ok, true);
    assert.equal((result as { masterIndex?: number }).masterIndex, 1);
  });

  test("rejects an index that is not in the list", () => {
    assert.deepEqual(applySetMaster(record({ sources: [ref(0)] }), 5), {
      ok: false,
      error: "unknown_index",
    });
  });

  test("rejects when nothing was uploaded", () => {
    assert.deepEqual(applySetMaster(record(), 0), { ok: false, error: "no_sources" });
  });
});

describe("applyRemoveSource", () => {
  test("removes the file and reports its storage key for deletion", () => {
    const result = applyRemoveSource(record({ sources: [ref(0), ref(1)], masterIndex: 0 }), 1);
    assert.equal(result.ok, true);
    const ok = result as { sources: SourceFileRef[]; masterIndex?: number; removed?: SourceFileRef };
    assert.deepEqual(ok.sources.map((s) => s.index), [0]);
    assert.equal(ok.masterIndex, 0);
    assert.equal(ok.removed?.storageKey, "session-x/source/1.docx");
  });

  test("removing the master reassigns it to the first remaining chapter", () => {
    const result = applyRemoveSource(
      record({ sources: [ref(0), ref(2), ref(1)], masterIndex: 0 }),
      0,
    );
    assert.equal(result.ok, true);
    assert.equal((result as { masterIndex?: number }).masterIndex, 2);
  });

  test("removing the last file leaves no dangling master", () => {
    const result = applyRemoveSource(record({ sources: [ref(0)], masterIndex: 0 }), 0);
    assert.equal(result.ok, true);
    const ok = result as { sources: SourceFileRef[]; masterIndex?: number };
    assert.deepEqual(ok.sources, []);
    assert.equal(ok.masterIndex, undefined);
  });

  test("rejects an index that is not in the list", () => {
    assert.deepEqual(applyRemoveSource(record({ sources: [ref(0)] }), 3), {
      ok: false,
      error: "unknown_index",
    });
  });
});

describe("toClientSources", () => {
  test("exposes order, names, sizes and the master — never storage keys", () => {
    const shaped = toClientSources(record({ sources: [ref(1), ref(0)], masterIndex: 0 }));

    assert.deepEqual(shaped, {
      sources: [
        { index: 1, originalFilename: "ficheiro-1.docx", sizeBytes: 200, isMaster: false },
        { index: 0, originalFilename: "ficheiro-0.docx", sizeBytes: 100, isMaster: true },
      ],
      masterIndex: 0,
    });
    for (const source of shaped.sources) {
      assert.equal("storageKey" in source, false);
    }
  });

  test("empty session shapes to an empty list", () => {
    assert.deepEqual(toClientSources(record()), { sources: [], masterIndex: null });
  });
});
