import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT } from "@/lib/errors/messages";

/**
 * Turns the outer-edge chapter tabs on or off (DIO-58). Stored on
 * the session record like the divider toggle; the next preview and the final
 * download both render with it. Tabs add no pages, so the page budget only
 * reports the toggle. A profile that cannot carry tabs (PDF delivery) ignores
 * the flag at render time (`chapterTabsAvailable`).
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
    await updateSession(session.id, { chapterTabs: enabled });
  } catch (error) {
    console.error("[session/chapter-tabs] update failed", error);
    return Response.json({ ok: false, errorMessagePt: UNEXPECTED_ERROR_PT }, { status: 500 });
  }

  return Response.json({ ok: true, enabled });
}
