import { getCurrentSession } from "@/lib/session/cookies";
import { DocumentNotReadyError, prepareDocument } from "@/lib/rendering/prepareDocument";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT, UPLOAD_REQUIRED_PT } from "@/lib/errors/messages";

/**
 * Formatting warnings for the current session (DIO-18): surfaces what
 * `applyFormatting` (DIO-10) already computes — forbidden images, restricted
 * tables, unsupported structures, an over-length estimate — which until now
 * was discarded after `prepareDocument` merged in the cover, with no route
 * or component ever reading it. Re-parses the upload rather than caching,
 * same reasoning as the preview/final-download pipelines (see
 * `prepareDocument.ts`): cheap, and never stale.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      { ok: false, errorMessagePt: SESSION_EXPIRED_PT },
      { status: 401 },
    );
  }

  try {
    const prepared = await prepareDocument(session);
    return Response.json({ ok: true, warnings: prepared.document.warnings });
  } catch (error) {
    if (error instanceof DocumentNotReadyError) {
      return Response.json(
        { ok: false, errorMessagePt: UPLOAD_REQUIRED_PT },
        { status: 409 },
      );
    }
    console.error("[session/warnings] prepare failed", error);
    return Response.json(
      { ok: false, errorMessagePt: UNEXPECTED_ERROR_PT },
      { status: 500 },
    );
  }
}
