"use client";

import { useEffect, useState } from "react";
import styles from "./FormattingSummary.module.css";

/**
 * Formatting summary shown next to the preview (DIO-17): whose rules apply
 * and where they're published (DIO-43), then a short pt-PT line of what was
 * actually applied — all derived server-side from the norm profile in use,
 * never hardcoded here.
 */

interface SourceLink {
  titlePt: string;
  url: string;
}

interface Summary {
  summaryPt: string;
  provenancePt: string;
  sources: SourceLink[];
}

type Status = { kind: "loading" } | { kind: "error" } | ({ kind: "ready" } & Summary);

export default function FormattingSummary() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/session/formatting-summary");
        const body = (await response.json()) as
          | ({ ok: true } & Summary)
          | { ok: false; errorMessagePt: string };

        if (cancelled) return;
        if (!body.ok) {
          setStatus({ kind: "error" });
          return;
        }
        setStatus({
          kind: "ready",
          summaryPt: body.summaryPt,
          provenancePt: body.provenancePt,
          sources: body.sources,
        });
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

  return (
    <div className={styles.summary}>
      <p className={styles.provenance}>{status.provenancePt}</p>
      <p>{status.summaryPt}</p>
      {status.sources.length > 0 && (
        <ul className={styles.sources} aria-label="Fontes das normas">
          {status.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.titlePt}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
