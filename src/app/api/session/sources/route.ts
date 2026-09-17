import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import {
  applyRemoveSource,
  applyReorder,
  applySetMaster,
  toClientSources,
} from "@/lib/session/sources";
import { deleteObject } from "@/lib/storage";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT, UPLOAD_REQUIRED_PT } from "@/lib/errors/messages";
import type { SessionRecord } from "@/lib/session/types";
import type { SourceMutationError } from "@/lib/session/sources";

/**
 * Source-list management for the multi-file CV (DIO-40).
 *
 * Uploading and appending live in `/api/upload`; this route owns everything
 * that happens to the list afterwards:
 *
 * - `GET`               → current list (order + documento principal), so the
 *                         wizard survives a refresh from the session record
 *                         alone — the ticket's first acceptance criterion.
 * - `PATCH { order }`   → reorder: `order` is the full permutation of stable
 *                         source indexes, in the desired chapter order.
 * - `PATCH { masterIndex }` → designate the documento principal. Both keys
 *                         may be sent together; order applies first.
 * - `DELETE { index }`  → remove one file (and its stored object).
 *
 * Indexes are the *stable* per-upload numbers the upload response handed
 * out, never array positions — see `src/lib/session/sources.ts`. All
 * mutations are validated against, and persisted into, the server-side
 * session record; render time never trusts anything client-asserted.
 */

const INVALID_REQUEST_PT = "Pedido inválido.";
const UNKNOWN_FILE_PT = "Esse ficheiro já não faz parte do teu currículo.";
const INVALID_ORDER_PT = "A ordem dos ficheiros é inválida.";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      { ok: false, errorMessagePt: SESSION_EXPIRED_PT },
      { status: 401 },
    );
  }

  return Response.json({ ok: true, ...toClientSources(session) });
}

export async function PATCH(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return invalidRequest();

  const order = "order" in body ? body.order : undefined;
  const masterIndex = "masterIndex" in body ? body.masterIndex : undefined;

  const wantsReorder = order !== undefined;
  const wantsMaster = masterIndex !== undefined;
  if (!wantsReorder && !wantsMaster) return invalidRequest();
  if (wantsReorder && !isIntegerArray(order)) return invalidRequest();
  if (wantsMaster && !isInteger(masterIndex)) return invalidRequest();

  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      { ok: false, errorMessagePt: SESSION_EXPIRED_PT },
      { status: 401 },
    );
  }

  // Apply against a working copy so `order` + `masterIndex` in one request
  // validate against the same state they will be persisted from.
  let working: SessionRecord = session;

  if (wantsReorder) {
    const result = applyReorder(working, order as number[]);
    if (!result.ok) return mutationError(result.error);
    working = { ...working, sources: result.sources, masterIndex: result.masterIndex };
  }

  if (wantsMaster) {
    const result = applySetMaster(working, masterIndex as number);
    if (!result.ok) return mutationError(result.error);
    working = { ...working, sources: result.sources, masterIndex: result.masterIndex };
  }

  return (await persist(session.id, working)).response;
}

export async function DELETE(request: Request) {
  const body = await readJsonObject(request);
  if (!body || !("index" in body) || !isInteger(body.index)) return invalidRequest();

  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      { ok: false, errorMessagePt: SESSION_EXPIRED_PT },
      { status: 401 },
    );
  }

  const result = applyRemoveSource(session, body.index);
  if (!result.ok) return mutationError(result.error);

  const response = await persist(session.id, {
    ...session,
    sources: result.sources,
    masterIndex: result.masterIndex,
  });

  // Only after the record no longer references it. Best-effort: a failed
  // delete leaves an unreferenced object that the TTL/purge regime (DIO-16)
  // removes on its own clock, so privacy never depends on this succeeding.
  if (response.ok && result.removed) {
    try {
      await deleteObject(result.removed.storageKey);
    } catch (error) {
      console.error("[session/sources] object delete failed; purge job will cover it", error);
    }
  }

  return response.response;
}

/** Writes the mutated source state back and shapes the standard response. */
async function persist(
  sessionId: string,
  next: SessionRecord,
): Promise<{ ok: boolean; response: Response }> {
  try {
    const updated = await updateSession(sessionId, {
      sources: next.sources ?? [],
      masterIndex: next.masterIndex,
      // Mutating the list means the session is on the multi-file shape; the
      // legacy single-file field must not linger and disagree.
      upload: undefined,
    });
    if (!updated) {
      return {
        ok: false,
        response: Response.json({ ok: false, errorMessagePt: SESSION_EXPIRED_PT }, { status: 401 }),
      };
    }
    return { ok: true, response: Response.json({ ok: true, ...toClientSources(updated) }) };
  } catch (error) {
    console.error("[session/sources] update failed", error);
    return {
      ok: false,
      response: Response.json({ ok: false, errorMessagePt: UNEXPECTED_ERROR_PT }, { status: 500 }),
    };
  }
}

function mutationError(error: SourceMutationError): Response {
  switch (error) {
    case "no_sources":
      return Response.json({ ok: false, errorMessagePt: UPLOAD_REQUIRED_PT }, { status: 409 });
    case "unknown_index":
      return Response.json({ ok: false, errorMessagePt: UNKNOWN_FILE_PT }, { status: 404 });
    case "invalid_order":
      return Response.json({ ok: false, errorMessagePt: INVALID_ORDER_PT }, { status: 400 });
  }
}

function invalidRequest(): Response {
  return Response.json({ ok: false, errorMessagePt: INVALID_REQUEST_PT }, { status: 400 });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isInteger);
}
