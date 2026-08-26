import { isPaid, updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { FINAL_CONTENT_TYPE, FinalNotReadyError, renderFinalPdf } from "@/lib/final/renderFinal";

/**
 * Serves the clean, non-watermarked PDF (DIO-15) — the thing that was paid
 * for. Gated on `payment.status`, which only the webhook ever sets, so this
 * route is the enforcement point for "unpaid session cannot obtain it by any
 * route": there is no other way to reach the unwatermarked render.
 */
export async function GET() {
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

  if (!isPaid(session)) {
    return Response.json(
      {
        ok: false,
        errorMessagePt: "O pagamento ainda não foi confirmado.",
      },
      { status: 402 },
    );
  }

  let rendered;
  try {
    rendered = await renderFinalPdf(session);
  } catch (error) {
    if (error instanceof FinalNotReadyError) {
      return Response.json(
        {
          ok: false,
          errorMessagePt: "Carrega primeiro o teu currículo.",
        },
        { status: 409 },
      );
    }
    throw error;
  }

  await updateSession(session.id, {
    artifacts: { ...session.artifacts, finalStorageKey: rendered.storageKey },
  });

  return new Response(new Uint8Array(rendered.pdf), {
    status: 200,
    headers: {
      "Content-Type": FINAL_CONTENT_TYPE,
      "Content-Disposition": "attachment; filename=curriculo-formatado.pdf",
      "Cache-Control": "no-store",
    },
  });
}
