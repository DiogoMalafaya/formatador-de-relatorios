import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { PreviewNotReadyError, renderPreviewPdf, PREVIEW_CONTENT_TYPE } from "@/lib/preview/renderPreview";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT, UPLOAD_REQUIRED_PT } from "@/lib/errors/messages";

/**
 * Streams the watermarked preview (DIO-13) for the current session,
 * re-rendering it fresh on every request — see `renderPreview.ts` for why.
 *
 * Session-only, no id in the URL: the token in the cookie is the only thing
 * that can ask for this session's preview, consistent with the "browser
 * holds a session id and nothing else" model in `session/types.ts`. This
 * route only ever serves the watermarked artifact; the clean PDF (DIO-15)
 * has no route yet, so there is nothing here that can leak it pre-payment.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      { ok: false, errorMessagePt: SESSION_EXPIRED_PT },
      { status: 401 },
    );
  }

  let rendered;
  try {
    rendered = await renderPreviewPdf(session);
  } catch (error) {
    if (error instanceof PreviewNotReadyError) {
      return Response.json(
        { ok: false, errorMessagePt: UPLOAD_REQUIRED_PT },
        { status: 409 },
      );
    }
    console.error("[session/preview] render failed", error);
    return Response.json(
      { ok: false, errorMessagePt: UNEXPECTED_ERROR_PT },
      { status: 500 },
    );
  }

  await updateSession(session.id, {
    artifacts: { ...session.artifacts, previewStorageKey: rendered.storageKey },
  });

  return new Response(new Uint8Array(rendered.pdf), {
    status: 200,
    headers: {
      "Content-Type": PREVIEW_CONTENT_TYPE,
      "Content-Disposition": "inline; filename=pre-visualizacao.pdf",
      "Cache-Control": "no-store",
    },
  });
}
