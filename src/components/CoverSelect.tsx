"use client";

import { useState } from "react";
import { getCovers } from "@/lib/covers";
import styles from "./CoverSelect.module.css";

/**
 * Cover template gallery (DIO-12). Selecting a card saves it against the
 * session immediately — the actual re-render happens wherever the preview
 * lives (DIO-13), which only needs `session.coverId`, not a re-upload.
 */

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "saved" };

export default function CoverSelect() {
  const covers = getCovers();
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSelect(coverId: string) {
    setSelectedId(coverId);
    setStatus({ kind: "saving" });

    try {
      const response = await fetch("/api/session/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverId }),
      });
      const body = (await response.json()) as
        | { ok: true; coverId: string }
        | { ok: false; errorMessagePt: string };

      if (!body.ok) {
        setStatus({ kind: "error", message: body.errorMessagePt });
        return;
      }
      setStatus({ kind: "saved" });
    } catch {
      setStatus({
        kind: "error",
        message: "Não foi possível guardar a capa. Tenta novamente.",
      });
    }
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.label}>Capa</p>
      <div className={styles.gallery} role="radiogroup" aria-label="Modelo de capa">
        {covers.map((cover) => (
          <button
            key={cover.id}
            type="button"
            role="radio"
            aria-checked={selectedId === cover.id}
            className={`${styles.card} ${selectedId === cover.id ? styles.cardSelected : ""}`}
            onClick={() => void handleSelect(cover.id)}
          >
            <span
              className={styles.thumbnail}
              dangerouslySetInnerHTML={{ __html: cover.thumbnailSvg }}
            />
            <span className={styles.cardName}>{cover.name}</span>
          </button>
        ))}
      </div>

      {status.kind === "saving" && (
        <p className={styles.statusInfo} role="status">
          A guardar…
        </p>
      )}
      {status.kind === "error" && (
        <p className={styles.statusError} role="alert">
          {status.message}
        </p>
      )}
      {status.kind === "saved" && (
        <p className={styles.statusSuccess} role="status">
          Capa guardada.
        </p>
      )}
    </div>
  );
}
