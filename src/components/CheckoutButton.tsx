"use client";

import { useState } from "react";
import styles from "./CheckoutButton.module.css";

/**
 * Starts Stripe Checkout (DIO-14) for the current session and redirects the
 * browser there. The actual "you're paid, here's your file" handoff is
 * DIO-15's job (the webhook is the source of truth) — this button only ever
 * gets the student to Stripe's hosted payment page.
 */

type Status = "idle" | "loading" | "error";

export default function CheckoutButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/session/checkout", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; url: string }
        | { ok: false; errorMessagePt?: string }
        | null;

      if (!response.ok || !body || !body.ok) {
        setError(
          (body && !body.ok ? body.errorMessagePt : undefined) ??
            "Não foi possível iniciar o pagamento. Tenta novamente.",
        );
        setStatus("idle");
        return;
      }

      window.location.href = body.url;
    } catch {
      setError("Não foi possível iniciar o pagamento. Tenta novamente.");
      setStatus("idle");
    }
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void startCheckout()}
        disabled={status === "loading"}
      >
        {status === "loading" ? "A abrir o pagamento…" : "Comprar download sem marca de água — 150€"}
      </button>

      {error && (
        <p className={styles.statusError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
