import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { getSpecialtyById } from "@/lib/specialties";

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
      {
        ok: false,
        errorMessagePt: "A tua sessão expirou. Carrega novamente o teu currículo.",
      },
      { status: 401 },
    );
  }

  await updateSession(session.id, { specialtyId });

  return Response.json({ ok: true, specialtyId });
}
