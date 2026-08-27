import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { getSpecialtyById } from "@/lib/specialties";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT } from "@/lib/errors/messages";

/**
 * Records the selected specialty against the current session (DIO-9).
 *
 * Requires an existing session — a specialty means nothing without an
 * upload to apply it to — rather than silently creating one, which would let
 * a specialty selection outlive the upload it was meant to describe.
 */
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

  const specialtyId =
    typeof body === "object" && body !== null && "specialtyId" in body
      ? (body as { specialtyId: unknown }).specialtyId
      : undefined;

  if (typeof specialtyId !== "string" || !getSpecialtyById(specialtyId)) {
    return Response.json(
      { ok: false, errorMessagePt: "Especialidade inválida." },
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
    await updateSession(session.id, { specialtyId });
  } catch (error) {
    console.error("[session/specialty] update failed", error);
    return Response.json(
      { ok: false, errorMessagePt: UNEXPECTED_ERROR_PT },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, specialtyId });
}
