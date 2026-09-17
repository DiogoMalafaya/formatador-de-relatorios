import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { getCoverById } from "@/lib/covers";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT } from "@/lib/errors/messages";

/**
 * Records the selected cover template against the current session (DIO-12).
 *
 * Cover selection lives independently of the upload — switching it never
 * touches `session.upload`, so a future render (DIO-13) only needs the
 * stored upload plus this `coverId`, no re-upload required.
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

  const coverId =
    typeof body === "object" && body !== null && "coverId" in body
      ? (body as { coverId: unknown }).coverId
      : undefined;

  if (typeof coverId !== "string" || !getCoverById(coverId)) {
    return Response.json(
      { ok: false, errorMessagePt: "Modelo de capa inválido." },
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
    await updateSession(session.id, { coverId });
  } catch (error) {
    console.error("[session/cover] update failed", error);
    return Response.json(
      { ok: false, errorMessagePt: UNEXPECTED_ERROR_PT },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, coverId });
}
