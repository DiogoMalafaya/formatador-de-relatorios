import { requireSecret } from "@/lib/env";
import { purgeExpiredSessions } from "@/lib/session";
import { purgeExpiredObjects } from "@/lib/storage";

/**
 * Scheduled purge (DIO-16), triggered daily by Vercel Cron (see `vercel.json`).
 *
 * The application-level backstop, not the primary enforcement: object
 * deletion is primarily the bucket's own lifecycle rule (DIO-6), and session
 * records are primarily Firestore's native TTL policy (DIO-21) — both are
 * best-effort with no timing guarantee, which is exactly what this job
 * exists to cover. Purges both stores regardless of payment status (D5): a
 * paid session is deleted on the same clock as an abandoned one.
 *
 * Idempotent and safe to re-run — both stores' `purgeExpired` only ever
 * removes records/objects already past `expiresAt`, so a second run in the
 * same window finds nothing left to do.
 *
 * Auth: Vercel automatically attaches `Authorization: Bearer $CRON_SECRET` to
 * cron-triggered requests when that env var is set — this is what rejects
 * any other caller. See the docs in `.env.example`.
 */
export async function GET(request: Request) {
  const expected = `Bearer ${requireSecret("CRON_SECRET")}`;
  if (request.headers.get("authorization") !== expected) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const [purgedObjects, purgedSessions] = await Promise.all([
      purgeExpiredObjects(),
      purgeExpiredSessions(),
    ]);

    console.log(
      `[cron/purge] purged ${purgedObjects} object(s), ${purgedSessions} session record(s)`,
    );

    return Response.json({ ok: true, purgedObjects, purgedSessions });
  } catch (error) {
    // A 500 here shows up as a failed invocation in Vercel's Cron dashboard
    // and function logs — the failure must be visible, never silent.
    console.error("[cron/purge] purge failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
