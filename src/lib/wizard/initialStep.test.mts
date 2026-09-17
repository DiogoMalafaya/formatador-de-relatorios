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
