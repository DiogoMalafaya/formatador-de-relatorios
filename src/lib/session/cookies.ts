import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, getSessionByToken } from ".";
import type { SessionRecord } from "./types";

/**
 * Cookie transport for the session token.
 *
 * Kept apart from the rest of the module so the core session logic stays
 * importable — and testable — outside a Next request context.
 *
 * A cookie rather than a URL parameter because the token must survive the round
 * trip out to Stripe Checkout and back (DIO-7 acceptance criteria), and because
 * a token in a URL leaks through Referer headers, browser history, and any link
 * a student pastes to a colleague.
 */

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" rather than "strict": the student returns from Stripe via a
    // cross-site redirect, and "strict" would withhold the cookie on that
    // navigation — stranding them on a paid session they cannot see.
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function readSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Current session for this request, or null. */
export async function getCurrentSession(): Promise<SessionRecord | null> {
  return getSessionByToken(await readSessionCookie());
}
