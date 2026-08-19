/**
 * Environment access.
 *
 * Every secret the project will need is declared here and read here, so there is
 * exactly one place to audit. Nothing in this module may be imported into a
 * client component — secrets would end up in the browser bundle.
 *
 * Values are read lazily rather than at module load: reading them eagerly makes
 * `next build` fail in CI, where the deployment secrets are deliberately absent.
 */

/** Secrets, added as the tickets that need them land. */
const SECRETS = [
  // DIO-14 / DIO-15 — Stripe
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  // DIO-6 — object storage
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_BUCKET",
  "STORAGE_REGION",
  "STORAGE_ENDPOINT",
  // DIO-7 — ephemeral session signing
  "SESSION_SIGNING_SECRET",
] as const;

export type SecretName = (typeof SECRETS)[number];

/**
 * Read a required secret. Throws if absent, rather than silently proceeding —
 * a missing Stripe key must fail loudly at the call site, not produce a broken
 * checkout for a student who is about to pay.
 */
export function requireSecret(name: SecretName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

/** Read an optional secret. */
export function optionalSecret(name: SecretName): string | undefined {
  return process.env[name] || undefined;
}

/**
 * Non-sensitive runtime facts, safe to return from a public endpoint.
 *
 * Reports only *whether* each secret is configured, never its value — and only
 * outside production. In production even the shape of the config stays private:
 * the health endpoint is public and the repository is open, so there is no
 * reason to publish which integrations are wired up.
 */
export function getPublicRuntimeInfo() {
  if (process.env.NODE_ENV === "production") {
    return { environment: "production" as const };
  }
  return {
    environment: process.env.NODE_ENV,
    configured: Object.fromEntries(
      SECRETS.map((name) => [name, Boolean(process.env[name])]),
    ),
  };
}
