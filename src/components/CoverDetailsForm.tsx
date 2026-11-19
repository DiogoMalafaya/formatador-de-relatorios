"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  COVER_DETAIL_LABELS_PT,
  COVER_DETAIL_MAX_LENGTH,
  isCoverDetailsComplete,
} from "@/lib/covers/details";
import type { CoverDetails } from "@/lib/covers/details";
import styles from "./CoverDetailsForm.module.css";

/**
 * Cover and página de rosto details (DIO-50): the local de formação the
 * norms require on the cover, the signatories for the rosto, and an optional
 * override of the name read from the documents. Saved explicitly — these are
 * typed, not picked, so saving on every keystroke would race itself.
 */

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "saved" };

interface CoverDetailsFormProps {
  initialDetails?: CoverDetails;
  /** Tells the wizard whether the cover step is now complete. */
  onSaved?: (details: CoverDetails) => void;
}

type FieldKey = keyof CoverDetails;

const FIELDS: { key: FieldKey; required: boolean; hintPt?: string; autoComplete?: string }[] = [
  { key: "hospital", required: true, hintPt: "Por exemplo, Hospital de Santa Maria." },
  { key: "city", required: true, autoComplete: "address-level2" },
  {
    key: "candidateName",
    required: false,
    autoComplete: "name",
    hintPt: "Se ficar em branco, usamos o nome que encontrámos no teu documento.",
  },
  { key: "orientador", required: false, hintPt: "Aparece por baixo da linha para a assinatura, na página de rosto." },
  { key: "diretor", required: false, hintPt: "Idem. Em branco, fica só a linha para assinar." },
];

export default function CoverDetailsForm({ initialDetails, onSaved }: CoverDetailsFormProps) {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    hospital: initialDetails?.hospital ?? "",
    city: initialDetails?.city ?? "",
    candidateName: initialDetails?.candidateName ?? "",
    orientador: initialDetails?.orientador ?? "",
    diretor: initialDetails?.diretor ?? "",
  });
  const [status, setStatus] = useState<Status>(
    isCoverDetailsComplete(initialDetails) ? { kind: "saved" } : { kind: "idle" },
  );

  function update(key: FieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (status.kind === "saved" || status.kind === "error") setStatus({ kind: "idle" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "saving" });
    try {
      const response = await fetch("/api/session/cover-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as
        | { ok: true; coverDetails: CoverDetails }
        | { ok: false; errorMessagePt: string };
      if (!body.ok) {
        setStatus({ kind: "error", message: body.errorMessagePt });
        return;
      }
      setStatus({ kind: "saved" });
      onSaved?.(body.coverDetails);
    } catch {
      setStatus({ kind: "error", message: "Não foi possível guardar os dados da capa. Tenta novamente." });
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
      <p className={styles.label}>Dados da capa e da página de rosto</p>
      <div className={styles.grid}>
        {FIELDS.map(({ key, required, hintPt, autoComplete }) => {
          const id = `cover-detail-${key}`;
          return (
            <div key={key} className={styles.field}>
              <label htmlFor={id} className={styles.fieldLabel}>
                {COVER_DETAIL_LABELS_PT[key]}
                {!required && <span className={styles.optional}> (opcional)</span>}
              </label>
              <input
                id={id}
                className={styles.input}
                type="text"
                value={values[key]}
                required={required}
                maxLength={COVER_DETAIL_MAX_LENGTH}
                autoComplete={autoComplete ?? "off"}
                aria-describedby={hintPt ? `${id}-hint` : undefined}
                onChange={(event) => update(key, event.target.value)}
              />
              {hintPt && (
                <p id={`${id}-hint`} className={styles.hint}>
                  {hintPt}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.save} disabled={status.kind === "saving"}>
          Guardar dados
        </button>
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
            Dados guardados.
          </p>
        )}
      </div>
    </form>
  );
}
