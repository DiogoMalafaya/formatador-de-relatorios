"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Icon from "./Icon";
import styles from "./PreviewPane.module.css";

/**
 * Watermarked preview (DIO-13, DIO-39): fetches the PDF bytes from the
 * session-cookie-gated endpoint and hands them to our pdf.js viewer, so the
 * document renders identically in every browser under our own chrome — no
 * <iframe>, no browser PDF UI, no blob URL. A failure (no upload yet,
 * expired session) still shows the crafted pt-PT message.
 *
 * pdf.js is client-only and heavy, so the viewer is code-split and never
 * server-rendered.
 */

const PdfViewer = dynamic(() => import("./pdf-viewer/PdfViewer"), {
  ssr: false,
  loading: () => <div className={styles.viewerSkeleton} aria-hidden="true" />,
});

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ArrayBuffer };

export default function PreviewPane() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function loadPreview() {
    setStatus({ kind: "loading" });

    try {
      const response = await fetch("/api/session/preview");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { errorMessagePt?: string }
          | null;
        setStatus({
          kind: "error",
          message: body?.errorMessagePt ?? "Não foi possível gerar a pré-visualização. Tenta novamente.",
        });
        return;
      }

      const data = await response.arrayBuffer();
      setStatus({ kind: "ready", data });
    } catch {
      setStatus({
        kind: "error",
        message: "Não foi possível gerar a pré-visualização. Tenta novamente.",
      });
    }
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void loadPreview()}
        disabled={status.kind === "loading"}
      >
        <Icon name="eye" />
        {status.kind === "loading" ? "A gerar pré-visualização…" : "Ver pré-visualização"}
      </button>

      {status.kind === "loading" && (
        <div className={styles.viewerSkeleton} aria-hidden="true" />
      )}

      {status.kind === "error" && (
        <p className={styles.statusError} role="alert">
          {status.message}
        </p>
      )}

      {status.kind === "ready" && <PdfViewer data={status.data} />}
    </div>
  );
}
