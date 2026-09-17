import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { OBJECT_TTL_MS, PUBLIC_RETENTION_HOURS } from "./types.ts";

describe("PUBLIC_RETENTION_HOURS", () => {
  test("stays a safe upper bound on the purge threshold plus the daily cron's worst-case wait (DIO-19)", () => {
    const purgeThresholdHours = OBJECT_TTL_MS / (60 * 60 * 1000);
    const maxCronWaitHours = 24;
    assert.ok(
      PUBLIC_RETENTION_HOURS >= purgeThresholdHours + maxCronWaitHours,
      `the privacy policy promises ${PUBLIC_RETENTION_HOURS}h, but the purge threshold ` +
        `(${purgeThresholdHours}h) plus a day of cron slop can take up to ` +
        `${purgeThresholdHours + maxCronWaitHours}h — raise PUBLIC_RETENTION_HOURS or lower OBJECT_TTL_MS`,
    );
  });
});
