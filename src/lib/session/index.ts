import { requireSecret } from "@/lib/env";
import { createSessionStore } from "./store";
import { generateSessionId, mintToken, verifyToken } from "./token";
import type { SessionRecord, SessionStore } from "./types";

export type { SessionRecord, SessionStore } from "./types";
export { generateSessionId, mintToken, verifyToken } from "./token";
export { InMemorySessionStore, createSessionStore } from "./store";

/**
 * Session lifetime.
 *
 * Must stay equal to the object-storage retention window in DIO-6 — the two
 * clocks are the same guarantee expressed twice, and drift between them either
 * strands a live session with deleted files or keeps a record past the privacy
 * commitment. 24h is the interim default; the 24-vs-48 decision is still open.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Cookie carrying the session token across the round trip to Stripe and back. */
export const SESSION_COOKIE_NAME = "fdr_session";

let store: SessionStore | undefined;

/** Lazily built so importing this module does not throw during `next build`. */
function getStore(): SessionStore {
  store ??= createSessionStore();
  return store;
}

/** Test seam. */
export function setSessionStore(next: SessionStore | undefined): void {
  store = next;
}

export interface NewSession {
  record: SessionRecord;
  /** Give this to the browser. Never log it — it is a bearer credential. */
  token: string;
}

export async function createSession(now: number = Date.now()): Promise<NewSession> {
  const record: SessionRecord = {
    id: generateSessionId(),
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    payment: { status: "unpaid" },
  };

  await getStore().create(record);

  return {
    record,
    token: mintToken(record.id, requireSecret("SESSION_SIGNING_SECRET")),
  };
}

/**
 * Resolve a token to its session, or null.
 *
 * Null covers every failure — forged signature, unknown id, expired session —
 * deliberately: callers should render one "a tua sessão expirou" state (DIO-18)
 * rather than distinguishing cases and telling an attacker which ids exist.
 */
export async function getSessionByToken(
  token: string | undefined | null,
): Promise<SessionRecord | null> {
  const sessionId = verifyToken(token, requireSecret("SESSION_SIGNING_SECRET"));
  if (!sessionId) return null;
  return getStore().get(sessionId);
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<SessionRecord, "id" | "createdAt" | "expiresAt">>,
): Promise<SessionRecord | null> {
  return getStore().update(id, patch);
}

/** True only when the webhook has confirmed payment (DIO-15). */
export function isPaid(record: SessionRecord): boolean {
  return record.payment.status === "paid";
}
