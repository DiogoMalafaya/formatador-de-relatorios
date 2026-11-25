"use client";

import { useState } from "react";
import { getRuleSet } from "@/lib/formatting/ruleSet";
import { resolveRuleSetId } from "@/lib/specialties";
import { constrain, constraintNotesPt, DEFAULT_THEME_ID, getThemes } from "@/lib/themes";
import styles from "./ThemeSelect.module.css";

/**
 * House theme picker (DIO-56). Each card previews the theme as the student's
 * profile will actually apply it: in strict mode (MFR) the swatch is black
 * and the face is the norm's, so the picker never promises a look the norms
 * forbid. Selecting saves to the session at once; the workspace then offers
 * a fresh preview, as it does for a cover change.
 */

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "saved" };

interface ThemeSelectProps {
  specialtyId: string;
  initialThemeId?: string;
  onSaved?: (themeId: string) => void;
}

export default function ThemeSelect({ specialtyId, initialThemeId, onSaved }: ThemeSelectProps) {
  const themes = getThemes();
  const ruleSet = getRuleSet(resolveRuleSetId(specialtyId));
  const notes = constraintNotesPt(ruleSet);
  const [selectedId, setSelectedId] = useState(initialThemeId ?? DEFAULT_THEME_ID);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSelect(themeId: string) {
    if (themeId === selectedId && status.kind !== "error") return;
    setSelectedId(themeId);
    setStatus({ kind: "saving" });

    try {
      const response = await fetch("/api/session/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId }),
      });
      const body = (await response.json()) as
        | { ok: true; themeId: string }
        | { ok: false; errorMessagePt: string };

      if (!body.ok) {
        setStatus({ kind: "error", message: body.errorMessagePt });
        return;
      }
      setStatus({ kind: "saved" });
      onSaved?.(themeId);
    } catch {
      setStatus({ kind: "error", message: "Não foi possível guardar o tema. Tenta novamente." });
    }
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.label}>Tema</p>
      <div className={styles.options} role="radiogroup" aria-label="Tema do documento">
        {themes.map((theme) => {
          const effective = constrain(theme, ruleSet);
          const selected = selectedId === theme.id;
          const serif = effective.bodyFamily === "Times New Roman";
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
              onClick={() => void handleSelect(theme.id)}
            >
              {/* The swatch depicts the document's own colour, not UI chrome. */}
              <span
                className={`${styles.swatch} ${serif ? styles.swatchSerif : styles.swatchSans}`}
                style={{ color: effective.accent }}
                aria-hidden="true"
              >
                Aa
                <span className={styles.swatchBar} style={{ backgroundColor: effective.accent }} />
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{theme.namePt}</span>
                <span className={styles.description}>{theme.descriptionPt}</span>
              </span>
            </button>
          );
        })}
      </div>

      {notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}

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
          Tema guardado.
        </p>
      )}
    </div>
  );
}
