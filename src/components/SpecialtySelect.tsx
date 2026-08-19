"use client";

import { useState } from "react";
import { getSpecialties } from "@/lib/specialties";
import styles from "./SpecialtySelect.module.css";

/**
 * Specialty selection (DIO-9).
 *
 * The list itself is config, not this component's concern — see
 * `src/lib/specialties/data.ts`. The note below exists because of D1: every
 * specialty applies the same generic rule set today, so we say so rather
 * than implying per-specialty formatting that doesn't exist yet.
 */

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "saved" };

export default function SpecialtySelect() {
  const specialties = getSpecialties();
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const specialtyId = event.target.value;
    setSelectedId(specialtyId);
    if (!specialtyId) return;

    setStatus({ kind: "saving" });

    try {
      const response = await fetch("/api/session/specialty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialtyId }),
      });
      const body = (await response.json()) as
        | { ok: true; specialtyId: string }
        | { ok: false; errorMessagePt: string };

      if (!body.ok) {
        setStatus({ kind: "error", message: body.errorMessagePt });
        return;
      }
      setStatus({ kind: "saved" });
    } catch {
      setStatus({
        kind: "error",
        message: "Não foi possível guardar a especialidade. Tenta novamente.",
      });
    }
  }

  return (
    <div className={styles.wrapper}>
      <label htmlFor="specialty-select" className={styles.label}>
        Especialidade
      </label>
      <select
        id="specialty-select"
        className={styles.select}
        value={selectedId}
        onChange={handleChange}
        aria-busy={status.kind === "saving"}
      >
        <option value="" disabled>
          Escolhe a tua especialidade
        </option>
        {specialties.map((specialty) => (
          <option key={specialty.id} value={specialty.id}>
            {specialty.name}
          </option>
        ))}
      </select>

      <p className={styles.note}>
        Formatação base comum a todas as especialidades — as normas próprias de
        cada Colégio vão sendo adicionadas progressivamente.
      </p>

      {status.kind === "error" && (
        <p className={styles.statusError} role="alert">
          {status.message}
        </p>
      )}
      {status.kind === "saved" && (
        <p className={styles.statusSuccess} role="status">
          Especialidade guardada.
        </p>
      )}
    </div>
  );
}
