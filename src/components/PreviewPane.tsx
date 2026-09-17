"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./PreviewPane.module.css";

/**
 * Watermarked preview (DIO-13): fetches the PDF as a blob rather than
 * pointing an <iframe> straight at the API route, so a failure (no upload
 * yet, expired session) shows the crafted pt-PT message instead of the
 * browser's raw JSON/error rendering inside the frame.
 */

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; url: string };

export default function PreviewPane() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

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

      const blob = await response.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setStatus({ kind: "ready", url });
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
        {status.kind === "loading" ? "A gerar pré-visualização…" : "Ver pré-visualização"}
      </button>

      {status.kind === "error" && (
        <p className={styles.statusError} role="alert">
          {status.message}
        </p>
      )}

      {status.kind === "ready" && (
        <iframe
          title="Pré-visualização do currículo formatado, com marca de água"
          src={status.url}
          className={styles.frame}
        />
      )}
    </div>
  );
}
