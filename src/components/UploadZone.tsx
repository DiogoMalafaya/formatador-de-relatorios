"use client";

import { useRef, useState } from "react";
import styles from "./UploadZone.module.css";

/**
 * Upload zone (DIO-8): drag & drop plus a file-picker fallback, both wired to
 * a hidden `<input type="file">` so mobile browsers get their native picker
 * for free — there is no separate mobile code path.
 *
 * Validates client-side first for instant PT feedback, then lets the server
 * (`/api/upload`) make the real call; a client-only check is a UX affordance,
 * not a security control, so every message shown here can also come back
 * from the server for a request that skipped the browser entirely.
 */

const MAX_UPLOAD_MB = 20;

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "error"; message: string }
  | { kind: "success"; filename: string };

function precheck(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return "Apenas ficheiros .docx são aceites.";
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `O ficheiro excede o limite de ${MAX_UPLOAD_MB} MB.`;
  }
  return null;
}

export default function UploadZone() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const precheckError = precheck(file);
    if (precheckError) {
      setStatus({ kind: "error", message: precheckError });
      return;
    }

    setStatus({ kind: "uploading" });

    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const body = (await response.json()) as
        | { ok: true; sessionId: string }
        | { ok: false; errorMessagePt: string };

      if (!body.ok) {
        setStatus({ kind: "error", message: body.errorMessagePt });
        return;
      }

      setStatus({ kind: "success", filename: file.name });
    } catch {
      setStatus({
        kind: "error",
        message: "Não foi possível enviar o ficheiro. Tenta novamente.",
      });
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so selecting the same file again still fires a change event.
    event.target.value = "";
  }

  const isUploading = status.kind === "uploading";

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.zone} ${isDragOver ? styles.zoneDragOver : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Carregar currículo em formato .docx"
        aria-busy={isUploading}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx"
          onChange={onInputChange}
          className={styles.hiddenInput}
          aria-hidden="true"
          tabIndex={-1}
        />
        <p className={styles.zoneTitle}>
          Arrasta o teu currículo .docx para aqui, ou clica para escolher um ficheiro
        </p>
        <p className={styles.zoneHint}>Apenas .docx · até {MAX_UPLOAD_MB} MB</p>
      </div>

      {status.kind === "uploading" && <p className={styles.statusInfo}>A enviar…</p>}
      {status.kind === "error" && (
        <p className={styles.statusError} role="alert">
          {status.message}
        </p>
      )}
      {status.kind === "success" && (
        <p className={styles.statusSuccess} role="status">
          «{status.filename}» enviado com sucesso.
        </p>
      )}
    </div>
  );
}
