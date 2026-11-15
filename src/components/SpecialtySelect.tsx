"use client";

import { useState } from "react";
import { getSupportedSpecialties } from "@/lib/specialties";
import styles from "./SpecialtySelect.module.css";

/**
 * Specialty selection (DIO-9, restricted in DIO-44).
 *
 * Lists only the specialties Lauda supports, i.e. those with a sourced norm
 * profile (`getSupportedSpecialties`). The list itself is config, not this
 * component's concern. Unsupported specialties are hidden, with a one-line
 * note saying so (PRD Q8), rather than listed and disabled.
 */

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "saved" };

interface SpecialtySelectProps {
  /** Restores a previously saved choice when the wizard step is revisited (DIO-37). */
  initialSpecialtyId?: string;
  /** The previously stored specialty, when it isn't supported and must be chosen again. */
  unsupportedSpecialtyNamePt?: string;
  /** Notifies the setup wizard (DIO-37) that this step is now satisfied. */
  onSaved?: (specialtyId: string) => void;
}

export default function SpecialtySelect({
  initialSpecialtyId,
  unsupportedSpecialtyNamePt,
  onSaved,
}: SpecialtySelectProps) {
  const specialties = getSupportedSpecialties();
  const [selectedId, setSelectedId] = useState(initialSpecialtyId ?? "");
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
      onSaved?.(specialtyId);
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

      {unsupportedSpecialtyNamePt && status.kind === "idle" && (
        <p className={styles.statusInfo} role="status">
          {unsupportedSpecialtyNamePt} ainda não é suportada. Escolhe novamente a tua
          especialidade para continuar.
        </p>
      )}

      <p className={styles.note}>
        A tua especialidade não aparece? Por agora suportamos apenas estas — estamos a
        acrescentar mais.
      </p>

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
          Especialidade guardada.
        </p>
      )}
    </div>
  );
}
