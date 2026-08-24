import { InMemorySessionStore } from "./store.ts";
import { defineSessionStoreContract } from "./contract.mts";

defineSessionStoreContract("InMemorySessionStore", () => new InMemorySessionStore());
