import { createObjectStore } from "./store.ts";
import type { ObjectStore } from "./types.ts";

export type { ObjectStore, StoredObjectMeta } from "./types.ts";
export { InMemoryObjectStore, createObjectStore, OBJECT_TTL_MS } from "./store.ts";

let store: ObjectStore | undefined;

/** Lazily built so importing this module does not throw during `next build`. */
function getStore(): ObjectStore {
  store ??= createObjectStore();
  return store;
}

/** Test seam. */
export function setObjectStore(next: ObjectStore | undefined): void {
  store = next;
}

export async function putObject(
  key: string,
  data: Buffer,
  contentType: string,
) {
  return getStore().put(key, data, contentType);
}

export async function getObject(key: string): Promise<Buffer | null> {
  return getStore().get(key);
}

export async function getObjectSignedUrl(
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  return getStore().getSignedUrl(key, ttlSeconds);
}

export async function deleteObject(key: string): Promise<void> {
  return getStore().delete(key);
}
