"use client";

import { useEffect, useState } from "react";
import styles from "./FormattingSummary.module.css";

/**
 * Formatting summary shown next to the preview (DIO-17): a short pt-PT line
 * telling the student what was actually applied — derived server-side from
 * the rule set in use, never hardcoded here.
 */

type Status =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; summaryPt: string };

export default function FormattingSummary() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/session/formatting-summary");
        const body = (await response.json()) as
          | { ok: true; summaryPt: string }
          | { ok: false; errorMessagePt: string };

        if (cancelled) return;
        if (!body.ok) {
          setStatus({ kind: "error" });
          return;
        }
        setStatus({ kind: "ready", summaryPt: body.summaryPt });
      } catch {
        if (!cancelled) setStatus({ kind: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind !== "ready") return null;

  return <p className={styles.summary}>{status.summaryPt}</p>;
}
