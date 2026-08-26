import Stripe from "stripe";
import { requireSecret } from "@/lib/env";
import { getSessionById, updateSession } from "@/lib/session";
import { getStripeClient } from "@/lib/stripe";

/**
 * Stripe webhook (DIO-15): the source of truth for payment state. The
 * browser's redirect back to `success_url` (DIO-14) is never trusted for
 * this — it can be lost, faked, or skipped entirely.
 *
 * Idempotent by construction rather than via a separate processed-events
 * log: a session's `payment.status` only ever moves unpaid → paid, so
 * re-applying "paid" to an already-paid session is a no-op. That's enough
 * for this domain (one payment per session) without a events collection.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      requireSecret("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    // Signature didn't verify — reject rather than trusting an unverified
    // body. Not a retryable failure on our end, so 400 (Stripe won't retry).
    return Response.json({ ok: false }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ ok: true, skipped: event.type });
  }

  const checkoutSession = event.data.object as Stripe.Checkout.Session;
  const sessionId = checkoutSession.client_reference_id;

  if (!sessionId || checkoutSession.payment_status !== "paid") {
    return Response.json({ ok: true, skipped: "not paid or unattributed" });
  }

  const record = await getSessionById(sessionId);
  if (!record) {
    // Session expired/purged between Checkout and the webhook arriving —
    // nothing to mark paid, and retrying won't change that.
    return Response.json({ ok: true, skipped: "unknown session" });
  }

  if (record.payment.status === "paid") {
    return Response.json({ ok: true, skipped: "already paid" });
  }

  await updateSession(sessionId, {
    payment: {
      status: "paid",
      stripeCheckoutSessionId: checkoutSession.id,
      paidAt: Date.now(),
    },
  });

  return Response.json({ ok: true });
}
