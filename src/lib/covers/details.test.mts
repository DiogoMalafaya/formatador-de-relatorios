import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatLocalDeFormacao, isCoverDetailsComplete, parseCoverDetails, COVER_DETAIL_MAX_LENGTH } from "./details.ts";

describe("parseCoverDetails (DIO-50)", () => {
  test("requires the hospital and the city; tidies whitespace; drops empty optionals", () => {
    const result = parseCoverDetails({ hospital: "  Hospital   Imaginário ", city: "Vila", orientador: "  ", diretor: "Dr. X" });
    assert.deepEqual(result, { ok: true, details: { hospital: "Hospital Imaginário", city: "Vila", diretor: "Dr. X" } });
  });

  test("refuses a missing city, a non-object body and an over-long field", () => {
    assert.equal(parseCoverDetails({ hospital: "H" }).ok, false);
    assert.equal(parseCoverDetails("H").ok, false);
    const long = parseCoverDetails({ hospital: "H", city: "C", orientador: "x".repeat(COVER_DETAIL_MAX_LENGTH + 1) });
    assert.equal(long.ok, false);
    assert.match(long.ok ? "" : long.errorMessagePt, /Orientador\(a\) de formação/);
  });

  test("ignores fields it doesn't know and values that aren't strings", () => {
    const result = parseCoverDetails({ hospital: "H", city: "C", candidateName: 42, admin: true });
    assert.deepEqual(result, { ok: true, details: { hospital: "H", city: "C" } });
  });

  test("completeness and the one-line local de formação", () => {
    assert.equal(isCoverDetailsComplete(undefined), false);
    assert.equal(isCoverDetailsComplete({ hospital: "H", city: " " }), false);
    assert.equal(isCoverDetailsComplete({ hospital: "H", city: "C" }), true);
    assert.equal(formatLocalDeFormacao({ hospital: "Hospital Imaginário", city: "Vila" }), "Hospital Imaginário, Vila");
  });
});
