/**
 * Shared pt-PT copy for failure states that recur across routes (DIO-18) —
 * kept in one place so the wording doesn't drift into differently-phrased
 * versions of the same three situations.
 */

/** Every session-dependent route hits this the same way — see session/index.ts. */
export const SESSION_EXPIRED_PT = "A tua sessão expirou. Carrega novamente o teu currículo.";

/** A route that needs a finished upload to do anything, before one exists. */
export const UPLOAD_REQUIRED_PT = "Carrega primeiro o teu currículo.";

/**
 * Catch-all for a genuinely unexpected failure (formatting engine crash, PDF
 * render timeout, storage or Firestore unavailable). Never interpolate the
 * underlying error into this — log it server-side instead, and never log the
 * document itself (CLAUDE.md: uploads may contain patient data).
 */
export const UNEXPECTED_ERROR_PT =
  "Ocorreu um erro ao processar o teu currículo. Tenta novamente daqui a pouco.";
