import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { getThemeById } from "@/lib/themes";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT } from "@/lib/errors/messages";

/**
 * Chooses the house theme (DIO-56). Stored on the session record like the
 * cover choice; the next preview and the final download both render with
 * it, constrained by the specialty's norm profile. A paid session may still
 * change it: the download re-renders from the record, so payment and
 * delivery stay one document either way.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, errorMessagePt: "Pedido inválido." }, { status: 400 });
  }

  const themeId =
    typeof body === "object" && body !== null && "themeId" in body
      ? (body as { themeId: unknown }).themeId
      : undefined;
  if (typeof themeId !== "string" || !getThemeById(themeId)) {
    return Response.json({ ok: false, errorMessagePt: "Tema desconhecido." }, { status: 400 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ ok: false, errorMessagePt: SESSION_EXPIRED_PT }, { status: 401 });
  }

  try {
    await updateSession(session.id, { themeId });
  } catch (error) {
    console.error("[session/theme] update failed", error);
    return Response.json({ ok: false, errorMessagePt: UNEXPECTED_ERROR_PT }, { status: 500 });
  }

  return Response.json({ ok: true, themeId });
}
