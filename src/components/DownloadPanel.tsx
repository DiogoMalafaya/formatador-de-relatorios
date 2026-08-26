"use client";

import { useEffect, useState } from "react";
import styles from "./DownloadPanel.module.css";

/**
 * Resolves the redirect-arrives-before-webhook race (DIO-15 acceptance
 * criteria): the browser lands back on `?pagamento=sucesso` (DIO-14) as soon
 * as Stripe redirects, which can beat the webhook that actually marks the
 * session paid. Polls rather than trusting the redirect itself, and a slow
 * webhook reads as "still confirming", never as an error or a lost payment.
 */

type Status =
  | { kind: "polling" }
  | { kind: "ready" }
  | { kind: "delayed" }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

export default function DownloadPanel() {
  const [status, setStatus] = useState<Status>({ kind: "polling" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      try {
        const response = await fetch("/api/session/status");
        const body = (await response.json().catch(() => null)) as
          | { ok: true; paid: boolean }
          | { ok: false; errorMessagePt?: string }
          | null;

        if (cancelled) return;

        if (!response.ok || !body || !body.ok) {
          setStatus({
            kind: "error",
            message:
              (body && !body.ok ? body.errorMessagePt : undefined) ??
              "Não foi possível confirmar o pagamento.",
          });
          return;
        }

        if (body.paid) {
          setStatus({ kind: "ready" });
          return;
        }

        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setStatus({ kind: "delayed" });
          return;
        }

        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) {
          timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (status.kind === "ready") {
    return (
      <div className={styles.wrapper}>
        <p className={styles.statusReady}>O teu currículo está pronto.</p>
        <a className={styles.button} href="/api/session/download">
          Descarregar currículo
        </a>
      </div>
    );
  }

  if (status.kind === "delayed") {
    return (
      <p className={styles.statusInfo}>
        A confirmação está a demorar mais do que o esperado. O pagamento não se
        perde — atualiza a página dentro de alguns minutos para tentares o
        download novamente.
      </p>
    );
  }

  if (status.kind === "error") {
    return (
      <p className={styles.statusError} role="alert">
        {status.message}
      </p>
    );
  }

  return <p className={styles.statusInfo}>A confirmar o pagamento…</p>;
}
