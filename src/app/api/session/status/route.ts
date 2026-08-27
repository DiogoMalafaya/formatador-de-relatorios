import { isPaid } from "@/lib/session";
import { getCurrentSession } from "@/lib/session/cookies";
import { SESSION_EXPIRED_PT } from "@/lib/errors/messages";

/**
 * Lightweight payment-status check (DIO-15), polled by the browser after the
 * Stripe redirect lands back on `?pagamento=sucesso` — the webhook usually
 * beats the redirect, but not always, and this is how the client resolves
 * that race without treating "not yet" as "something went wrong".
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      { ok: false, errorMessagePt: SESSION_EXPIRED_PT },
      { status: 401 },
    );
  }

  return Response.json({ ok: true, paid: isPaid(session) });
}
