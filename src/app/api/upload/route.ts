import { createSession, getSessionByToken, updateSession } from "@/lib/session";
import { readSessionCookie, setSessionCookie } from "@/lib/session/cookies";
import { putObject } from "@/lib/storage";
import { DOCX_CONTENT_TYPE, validateUpload } from "@/lib/upload/validate";

/**
 * Upload endpoint (DIO-8).
 *
 * No account, no email, no password: a successful upload *is* the sign-up —
 * it creates the session (DIO-7) that everything downstream hangs off.
 *
 * Client-side checks in `UploadZone` exist for instant feedback only; this is
 * the actual security control, per the ticket's own acceptance criteria.
 *
 * NOTE for DIO-5: this reads the whole file into memory before storing it,
 * which is fine up to `MAX_UPLOAD_BYTES` (20MB) — but several serverless
 * hosts cap request body size below that (Vercel's default is 4.5MB). Confirm
 * the deployed body-size limit against `MAX_UPLOAD_BYTES` once hosting is live.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { ok: false, errorMessagePt: "Pedido inválido." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, errorMessagePt: "Nenhum ficheiro foi selecionado." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const validation = validateUpload({
    filename: file.name,
    sizeBytes: buffer.byteLength,
    header: buffer,
  });

  if (!validation.ok) {
    return Response.json(
      { ok: false, errorMessagePt: validation.errorMessagePt },
      { status: 400 },
    );
  }

  const existing = await getSessionByToken(await readSessionCookie());

  let sessionId: string;
  let tokenToSet: string | null = null;
  if (existing) {
    sessionId = existing.id;
  } else {
    const created = await createSession();
    sessionId = created.record.id;
    tokenToSet = created.token;
  }

  const storageKey = `${sessionId}/upload.docx`;
  await putObject(storageKey, buffer, file.type || DOCX_CONTENT_TYPE);

  await updateSession(sessionId, {
    upload: {
      storageKey,
      originalFilename: file.name,
      sizeBytes: buffer.byteLength,
    },
  });

  if (tokenToSet) {
    await setSessionCookie(tokenToSet);
  }

  return Response.json({ ok: true, sessionId });
}
