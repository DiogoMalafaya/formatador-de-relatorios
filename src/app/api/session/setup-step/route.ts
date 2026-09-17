import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT } from "@/lib/errors/messages";

/**
 * Persists the guided-setup wizard's current step (DIO-37) so a refresh
 * restores progress. Pure UI state: nothing downstream may branch on it —
 * the record's own fields (upload, specialtyId, coverId) stay the source of
 * truth for what has actually been completed.
 *
 * Requires an existing session, same rationale as the specialty route: a
 * wizard position means nothing without the upload that created the session.
 */

const MIN_STEP = 1;
const MAX_STEP = 4;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, errorMessagePt: "Pedido inválido." },
      { status: 400 },
    );
  }

  const step =
    typeof body === "object" && body !== null && "step" in body
      ? (body as { step: unknown }).step
      : undefined;

  if (typeof step !== "number" || !Number.isInteger(step) || step < MIN_STEP || step > MAX_STEP) {
    return Response.json(
      { ok: false, errorMessagePt: "Pedido inválido." },
      { status: 400 },
    );
  }

  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      { ok: false, errorMessagePt: SESSION_EXPIRED_PT },
      { status: 401 },
    );
  }

  try {
    await updateSession(session.id, { setupStep: step });
  } catch (error) {
    console.error("[session/setup-step] update failed", error);
    return Response.json(
      { ok: false, errorMessagePt: UNEXPECTED_ERROR_PT },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, step });
}
