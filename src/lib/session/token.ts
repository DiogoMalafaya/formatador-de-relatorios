import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Session tokens (DIO-7).
 *
 * A token is `<sessionId>.<hmac>`. The id names a server-side record; the HMAC
 * proves we issued it. The token carries no storage keys and no payment state —
 * see the note in `types.ts`. That is what makes "a valid token for session A
 * cannot retrieve session B's files" true by construction rather than by a
 * check someone has to remember to write.
 */

const SEPARATOR = ".";

/**
 * 256 bits of entropy. The id is the only thing standing between a stranger and
 * someone else's medical CV, so it is sized to be unguessable, not merely
 * unique.
 */
const SESSION_ID_BYTES = 32;

/** base64url alphabet — no `.`, so the separator is unambiguous. */
export function generateSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString("base64url");
}

function sign(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

export function mintToken(sessionId: string, secret: string): string {
  return `${sessionId}${SEPARATOR}${sign(sessionId, secret)}`;
}

/**
 * Returns the session id if the token is authentic, otherwise null.
 *
 * Never throws on malformed input: this parses attacker-controlled data, and a
 * thrown exception is an easier oracle than a null.
 */
export function verifyToken(
  token: string | undefined | null,
  secret: string,
): string | null {
  if (!token) return null;

  const separatorIndex = token.lastIndexOf(SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) return null;

  const sessionId = token.slice(0, separatorIndex);
  const providedSignature = token.slice(separatorIndex + 1);
  const expectedSignature = sign(sessionId, secret);

  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  // Compare lengths first and only then compare contents in constant time.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return sessionId;
}
