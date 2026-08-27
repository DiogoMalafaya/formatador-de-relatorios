"use client";

import { useEffect, useState } from "react";
import styles from "./FormattingWarnings.module.css";

/**
 * Surfaces the formatting engine's warnings (DIO-10) next to the preview —
 * forbidden images, restricted tables, unsupported structures, an
 * over-length estimate. The engine has always computed these; until DIO-18
 * nothing in the UI ever read them, so a student had no way to know their
 * document needed a look before paying.
 */

interface Warning {
  code: string;
  messagePt: string;
}

type Status = { kind: "loading" } | { kind: "hidden" } | { kind: "ready"; warnings: Warning[] };

export default function FormattingWarnings() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/session/warnings");
        const body = (await response.json().catch(() => null)) as
          | { ok: true; warnings: Warning[] }
          | { ok: false; errorMessagePt: string }
          | null;

        if (cancelled) return;
        if (!body || !body.ok || body.warnings.length === 0) {
          setStatus({ kind: "hidden" });
          return;
        }
        setStatus({ kind: "ready", warnings: body.warnings });
      } catch {
        if (!cancelled) setStatus({ kind: "hidden" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind !== "ready") return null;

  return (
    <div className={styles.wrapper} role="status">
      <p className={styles.heading}>Antes de continuares, confirma:</p>
      <ul className={styles.list}>
        {status.warnings.map((warning, index) => (
          <li key={`${warning.code}-${index}`} className={styles.item}>
            {warning.messagePt}
          </li>
        ))}
      </ul>
    </div>
  );
}
