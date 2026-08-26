import Stripe from "stripe";
import { requireSecret } from "@/lib/env";

let client: Stripe | undefined;

/** Lazily built, same reasoning as `session/index.ts`'s store: importing this
 * module must not throw during `next build`, where secrets are absent. */
export function getStripeClient(): Stripe {
  client ??= new Stripe(requireSecret("STRIPE_SECRET_KEY"));
  return client;
}

/** Test seam. */
export function setStripeClient(next: Stripe | undefined): void {
  client = next;
}
