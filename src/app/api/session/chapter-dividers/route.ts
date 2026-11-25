import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT } from "@/lib/errors/messages";

/**
 * Turns the chapter divider pages on or off (DIO-54, PRD US7). Stored on
 * the session record like the cover choice; the next preview and the final
 * download both render with it. The page budget accounts for the change at
 * once, before any re-render (see `rendering/pageBudget.ts`).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, errorMessagePt: "Pedido inválido." }, { status: 400 });
  }

  const enabled =
    typeof body === "object" && body !== null && "enabled" in body
      ? (body as { enabled: unknown }).enabled
      : undefined;
  if (typeof enabled !== "boolean") {
    return Response.json({ ok: false, errorMessagePt: "Pedido inválido." }, { status: 400 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ ok: false, errorMessagePt: SESSION_EXPIRED_PT }, { status: 401 });
  }

  try {
    await updateSession(session.id, { chapterDividers: enabled });
  } catch (error) {
    console.error("[session/chapter-dividers] update failed", error);
    return Response.json({ ok: false, errorMessagePt: UNEXPECTED_ERROR_PT }, { status: 500 });
  }

  return Response.json({ ok: true, enabled });
}
