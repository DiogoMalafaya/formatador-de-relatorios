import { createSession, getSessionByToken, updateSession } from "@/lib/session";
import { readSessionCookie, setSessionCookie } from "@/lib/session/cookies";
import {
  combinedSourceBytes,
  getOrderedSources,
  nextSourceIndex,
  sourceStorageKey,
  toClientSources,
} from "@/lib/session/sources";
import { putObject } from "@/lib/storage";
import {
  DOCX_CONTENT_TYPE,
  validateSourceCollection,
  validateUpload,
} from "@/lib/upload/validate";
import { UNEXPECTED_ERROR_PT } from "@/lib/errors/messages";
import type { SourceFileRef } from "@/lib/session/types";

/**
 * Upload endpoint (DIO-8, multi-file since DIO-40).
 *
 * No account, no email, no password: the first successful upload *is* the
 * sign-up — it creates the session (DIO-7) that everything downstream hangs
 * off.
 *
 * **API shape:** one `multipart/form-data` POST with one or more `file`
 * entries. Files are *appended* to the session's source list in the order
 * they appear, so the wizard can equally send fifteen files in one request
 * or repeat single-file requests as the student adds chapters — both
 * accumulate. The response carries the full resulting list. The very first
 * source of a session becomes the documento principal automatically (the
 * single-file degenerate case is exactly the pre-DIO-40 behaviour);
 * reordering, removal and re-designating the master live in
 * `/api/session/sources`.
 *
 * Rejection is all-or-nothing per request: if any file in the batch fails
 * validation, or the batch would blow the collection caps, nothing from the
 * batch is stored.
 *
 * Client-side checks in the wizard exist for instant feedback only; this is
 * the actual security control, per DIO-8's own acceptance criteria.
 *
 * NOTE for DIO-5: this reads whole files into memory before storing them,
 * which is fine up to the caps in `validate.ts` — but several serverless
 * hosts cap request body size below that (Vercel's default is 4.5MB). Confirm
 * the deployed body-size limit against the caps once hosting is live.
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

  const files = formData.getAll("file").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return Response.json(
      { ok: false, errorMessagePt: "Nenhum ficheiro foi selecionado." },
      { status: 400 },
    );
  }

  const candidates: { file: File; buffer: Buffer }[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());

    const validation = validateUpload({
      filename: file.name,
      sizeBytes: buffer.byteLength,
      header: buffer,
    });

    if (!validation.ok) {
      // `filename` lets the wizard attribute the failure to one file of the
      // batch. It is echoed back to its own uploader, never logged.
      return Response.json(
        { ok: false, errorMessagePt: validation.errorMessagePt, filename: file.name },
        { status: 400 },
      );
    }

    candidates.push({ file, buffer });
  }

  const existing = await getSessionByToken(await readSessionCookie());

  const collectionCheck = validateSourceCollection({
    existingCount: existing ? getOrderedSources(existing).length : 0,
    existingCombinedBytes: existing ? combinedSourceBytes(existing) : 0,
    addedCount: candidates.length,
    addedBytes: candidates.reduce((sum, entry) => sum + entry.buffer.byteLength, 0),
  });
  if (!collectionCheck.ok) {
    return Response.json(
      { ok: false, errorMessagePt: collectionCheck.errorMessagePt },
      { status: 400 },
    );
  }

  let tokenToSet: string | null = null;
  try {
    let record = existing;
    if (!record) {
      const created = await createSession();
      record = created.record;
      tokenToSet = created.token;
    }

    const sources = [...getOrderedSources(record)];
    let index = nextSourceIndex(sources);

    for (const { file, buffer } of candidates) {
      const storageKey = sourceStorageKey(record.id, index);
      await putObject(storageKey, buffer, file.type || DOCX_CONTENT_TYPE);
      sources.push({
        index,
        storageKey,
        originalFilename: file.name,
        sizeBytes: buffer.byteLength,
      });
      index += 1;
    }

    const updated = await updateSession(record.id, {
      sources,
      // First upload of the session: source 0 is automatically the master.
      // Kept thereafter; /api/session/sources is where it changes.
      masterIndex: record.masterIndex ?? firstIndex(sources),
      // The legacy single-file field is superseded the moment `sources`
      // exists — leaving it set would make two modules disagree about which
      // file is the CV.
      upload: undefined,
    });
    if (!updated) {
      // Session expired between the read above and the write — same outcome
      // for the student as any other expiry.
      return Response.json(
        { ok: false, errorMessagePt: UNEXPECTED_ERROR_PT },
        { status: 500 },
      );
    }

    if (tokenToSet) {
      await setSessionCookie(tokenToSet);
    }

    return Response.json({ ok: true, sessionId: updated.id, ...toClientSources(updated) });
  } catch (error) {
    console.error("[upload] storage/session write failed", error);
    return Response.json(
      { ok: false, errorMessagePt: UNEXPECTED_ERROR_PT },
      { status: 500 },
    );
  }
}

function firstIndex(sources: SourceFileRef[]): number | undefined {
  return sources.length > 0 ? sources[0].index : undefined;
}
