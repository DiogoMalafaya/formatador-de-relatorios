import { updateSession } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { CURRENCY, PRICE_EUR_CENTS } from "@/lib/payment/pricing";
import { getStripeClient } from "@/lib/stripe";

/**
 * Starts a Stripe Checkout session for the student's current session (DIO-14).
 *
 * Card only for now (MB WAY/Multibanco to follow — see the DIO-14 comment
 * thread). No custom card form: Stripe hosts the whole payment page, so no
 * card data ever touches this app.
 *
 * `client_reference_id` ties the Checkout Session back to our session id —
 * the webhook (DIO-15) uses it to mark the *right* session paid, which is
 * what makes "a payment for session A cannot unlock session B" hold.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      {
        ok: false,
        errorMessagePt: "A tua sessão expirou. Carrega novamente o teu currículo.",
      },
      { status: 401 },
    );
  }

  if (!session.upload) {
    return Response.json(
      {
        ok: false,
        errorMessagePt: "Carrega primeiro o teu currículo.",
      },
      { status: 409 },
    );
  }

  if (session.payment.status === "paid") {
    return Response.json(
      {
        ok: false,
        errorMessagePt: "Este currículo já foi pago.",
      },
      { status: 409 },
    );
  }

  const origin = new URL(request.url).origin;

  const checkoutSession = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: session.id,
    metadata: { sessionId: session.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: PRICE_EUR_CENTS,
          product_data: {
            name: "Currículo formatado — download final sem marca de água",
          },
        },
      },
    ],
    // Both land back on the single-page app; the session cookie (unaffected
    // by this cross-site round trip — see cookies.ts on sameSite: "lax")
    // keeps the student's upload, specialty and cover intact either way.
    success_url: `${origin}/?pagamento=sucesso`,
    cancel_url: `${origin}/?pagamento=cancelado`,
  });

  if (!checkoutSession.url) {
    return Response.json(
      {
        ok: false,
        errorMessagePt: "Não foi possível iniciar o pagamento. Tenta novamente.",
      },
      { status: 502 },
    );
  }

  await updateSession(session.id, {
    payment: { ...session.payment, stripeCheckoutSessionId: checkoutSession.id },
  });

  return Response.json({ ok: true, url: checkoutSession.url });
}
