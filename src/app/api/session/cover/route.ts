import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { getCoverById } from "@/lib/covers";

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
      {
        ok: false,
        errorMessagePt: "A tua sessão expirou. Carrega novamente o teu currículo.",
      },
      { status: 401 },
    );
  }

  await updateSession(session.id, { coverId });

  return Response.json({ ok: true, coverId });
}
