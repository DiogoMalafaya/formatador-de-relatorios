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

type DownloadState =
  | { kind: "idle" }
  | { kind: "downloading" }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

export default function DownloadPanel() {
  const [status, setStatus] = useState<Status>({ kind: "polling" });
  const [downloadState, setDownloadState] = useState<DownloadState>({ kind: "idle" });

  async function handleDownload() {
    setDownloadState({ kind: "downloading" });

    try {
      const response = await fetch("/api/session/download");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { errorMessagePt?: string }
          | null;
        setDownloadState({
          kind: "error",
          message: body?.errorMessagePt ?? "Não foi possível descarregar o teu currículo. Tenta novamente.",
        });
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "curriculo-formatado.pdf";
      link.click();
      URL.revokeObjectURL(url);
      setDownloadState({ kind: "idle" });
    } catch {
      setDownloadState({
        kind: "error",
        message: "Não foi possível descarregar o teu currículo. Tenta novamente.",
      });
    }
  }

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
        <button
          type="button"
          className={styles.button}
          onClick={() => void handleDownload()}
          disabled={downloadState.kind === "downloading"}
        >
          {downloadState.kind === "downloading" ? "A descarregar…" : "Descarregar currículo"}
        </button>
        {downloadState.kind === "error" && (
          <p className={styles.statusError} role="alert">
            {downloadState.message}
          </p>
        )}
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
