import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { parseCoverDetails } from "@/lib/covers/details";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT } from "@/lib/errors/messages";

/**
 * Records the cover and página de rosto details (DIO-50): local de formação,
 * signatories, an optional name override. Replaces the whole set each time,
 * so clearing an optional field really clears it.
 *
 * Personal data: never logged, not even on failure.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, errorMessagePt: "Pedido inválido." }, { status: 400 });
  }

  const parsed = parseCoverDetails(body);
  if (!parsed.ok) {
    return Response.json({ ok: false, errorMessagePt: parsed.errorMessagePt }, { status: 400 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ ok: false, errorMessagePt: SESSION_EXPIRED_PT }, { status: 401 });
  }

  try {
    await updateSession(session.id, { coverDetails: parsed.details });
  } catch {
    console.error("[session/cover-details] update failed");
    return Response.json({ ok: false, errorMessagePt: UNEXPECTED_ERROR_PT }, { status: 500 });
  }

  return Response.json({ ok: true, coverDetails: parsed.details });
}
