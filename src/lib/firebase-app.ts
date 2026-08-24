import { cert, getApps, initializeApp } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { requireSecret } from "./env.ts";

/**
 * Shared Firebase Admin app for both the object store (DIO-6) and the session
 * store (DIO-21) — one Firebase project, one service account, one credential
 * read. `initializeApp` throws if called twice for the same app name, so
 * every caller goes through this instead of rolling its own.
 */
export function getFirebaseApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = requireSecret("FIREBASE_PROJECT_ID");
  const clientEmail = requireSecret("FIREBASE_CLIENT_EMAIL");
  // Service-account JSON keys carry literal "\n" once round-tripped through
  // an env var; the Admin SDK needs the real newlines back.
  const privateKey = requireSecret("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const storageBucket = requireSecret("FIREBASE_STORAGE_BUCKET");

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  });
}
