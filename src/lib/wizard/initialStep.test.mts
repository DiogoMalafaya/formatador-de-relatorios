import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { maxReachableStep, resolveInitialSetupStep } from "./initialStep.ts";
import type { SessionRecord } from "../session/types.ts";

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-test",
    createdAt: 0,
    expiresAt: Number.MAX_SAFE_INTEGER,
    payment: { status: "unpaid" },
    ...overrides,
  };
}

const upload = {
  storageKey: "uploads/session-test.docx",
  originalFilename: "curriculo.docx",
  sizeBytes: 1024,
};

// Multi-file shape the upload route writes since DIO-40: `sources[]` +
// `masterIndex`, no legacy `upload`.
const sources = [
  {
    index: 0,
    storageKey: "session-test/source/0.docx",
    originalFilename: "principal.docx",
    sizeBytes: 2048,
  },
  {
    index: 1,
    storageKey: "session-test/source/1.docx",
    originalFilename: "capitulo.docx",
    sizeBytes: 1024,
  },
];
const multi = { sources, masterIndex: 0 };

describe("maxReachableStep", () => {
  test("no session means step 1", () => {
    assert.equal(maxReachableStep(null), 1);
  });

  test("advances only as far as the record's decisions", () => {
    assert.equal(maxReachableStep(record()), 1);
    assert.equal(maxReachableStep(record({ upload })), 2);
    assert.equal(maxReachableStep(record({ upload, specialtyId: "pediatria" })), 3);
    assert.equal(
      maxReachableStep(record({ upload, specialtyId: "pediatria", coverId: "classica" })),
      4,
    );
  });

  test("a multi-file session (sources[] only) counts as uploaded", () => {
    assert.equal(maxReachableStep(record(multi)), 2);
    assert.equal(maxReachableStep(record({ ...multi, specialtyId: "pediatria" })), 3);
    assert.equal(
      maxReachableStep(record({ ...multi, specialtyId: "pediatria", coverId: "classica" })),
      4,
    );
  });

  test("an empty sources[] is not an upload", () => {
    assert.equal(
      maxReachableStep(record({ sources: [], specialtyId: "pediatria", coverId: "classica" })),
      1,
    );
  });
});

describe("resolveInitialSetupStep", () => {
  const complete = { upload, specialtyId: "pediatria", coverId: "classica" };

  test("uses the persisted step while it is still reachable", () => {
    assert.equal(resolveInitialSetupStep(record({ ...complete, setupStep: 2 })), 2);
  });

  test("ignores a persisted step beyond what the record supports", () => {
    assert.equal(resolveInitialSetupStep(record({ upload, setupStep: 4 })), 2);
  });

  test("ignores a malformed persisted step", () => {
    assert.equal(resolveInitialSetupStep(record({ ...complete, setupStep: 2.5 })), 4);
    assert.equal(resolveInitialSetupStep(record({ ...complete, setupStep: 0 })), 4);
  });

  test("defaults to the furthest reachable step", () => {
    assert.equal(resolveInitialSetupStep(null), 1);
    assert.equal(resolveInitialSetupStep(record(complete)), 4);
  });

  test("a paid session opens on the workspace even with an earlier persisted step", () => {
    const paid = record({
      ...complete,
      setupStep: 2,
      payment: { status: "paid", paidAt: 1 },
    });
    assert.equal(resolveInitialSetupStep(paid), 4);
  });

  test("a paid but incomplete record still cannot skip missing decisions", () => {
    const paid = record({ upload, payment: { status: "paid", paidAt: 1 } });
    assert.equal(resolveInitialSetupStep(paid), 2);
  });
});

describe("unsupported specialty (DIO-44)", () => {
  const unsupported = { upload, specialtyId: "cardiologia", coverId: "classica" };

  test("an unpaid session with an unsupported specialty goes back to the specialty step", () => {
    assert.equal(maxReachableStep(record(unsupported)), 2);
    assert.equal(resolveInitialSetupStep(record({ ...unsupported, setupStep: 4 })), 2);
  });

  test("a paid session keeps its specialty and reaches its download", () => {
    const paid = record({ ...unsupported, payment: { status: "paid", paidAt: 1 } });
    assert.equal(resolveInitialSetupStep(paid), 4);
  });
});

describe("resolveInitialSetupStep with multi-file sources", () => {
  const complete = { ...multi, specialtyId: "pediatria", coverId: "classica" };

  test("a complete record reopens on the workspace after a refresh", () => {
    assert.equal(resolveInitialSetupStep(record({ ...complete, setupStep: 4 })), 4);
    assert.equal(resolveInitialSetupStep(record(complete)), 4);
  });

  test("uses the persisted step while it is still reachable", () => {
    assert.equal(resolveInitialSetupStep(record({ ...complete, setupStep: 3 })), 3);
    assert.equal(
      resolveInitialSetupStep(record({ ...multi, specialtyId: "pediatria", setupStep: 2 })),
      2,
    );
  });

  test("ignores a persisted step beyond what the record supports", () => {
    assert.equal(resolveInitialSetupStep(record({ ...multi, setupStep: 4 })), 2);
  });

  test("a paid session opens on the workspace", () => {
    const paid = record({
      ...complete,
      setupStep: 2,
      payment: { status: "paid", paidAt: 1 },
    });
    assert.equal(maxReachableStep(paid), 4);
    assert.equal(resolveInitialSetupStep(paid), 4);
  });
});
