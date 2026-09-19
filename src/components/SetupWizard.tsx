"use client";

import { useState } from "react";
import type { WizardStep } from "@/lib/wizard/initialStep";
import CoverSelect from "./CoverSelect";
import Icon from "./Icon";
import SpecialtySelect from "./SpecialtySelect";
import UploadZone from "./UploadZone";
import Workspace from "./Workspace";
import styles from "./SetupWizard.module.css";

/**
 * Guided setup wizard (DIO-37): one decision per screen — (1) upload,
 * (2) specialty, (3) cover — then the two-pane workspace (DIO-38) with the
 * preview, the rehomed summary/warnings/cover rail and the anchored
 * checkout/download action.
 *
 * State model: the server session record is the source of truth. This
 * component receives the record's relevant fields as initial props (so a
 * refresh restores progress) and mirrors completion locally as the student
 * moves; each step's own component still saves to its API route exactly as
 * before. Step changes are persisted fire-and-forget via
 * `/api/session/setup-step` — a failed persist must never block navigation,
 * it only costs the restore-on-refresh nicety.
 *
 * Jumping back into a step from the workspace goes through the same `goTo`
 * as the stepper, so revisiting and returning keeps every choice: the
 * decisions live in this component's state and in the session record, never
 * in the step screens themselves.
 */

export type { WizardStep };

interface SetupWizardProps {
  initialStep: WizardStep;
  hasUpload: boolean;
  uploadFilename?: string;
  specialtyId?: string;
  coverId?: string;
  /**
   * Payment state as the server rendered it (webhook-fed record, or the
   * Stripe success redirect). Only chooses which primary action the
   * workspace anchors — DownloadPanel re-verifies against the record.
   */
  paid: boolean;
  /** Formatted server-side from the pricing lib; see CheckoutButton. */
  priceLabelPt: string;
}

const STEPS: Array<{ step: WizardStep; labelPt: string }> = [
  { step: 1, labelPt: "Currículo" },
  { step: 2, labelPt: "Especialidade" },
  { step: 3, labelPt: "Capa" },
  { step: 4, labelPt: "Pré-visualização" },
];

function persistStep(step: WizardStep) {
  // Fire-and-forget: before the first upload there is no session to write to,
  // and losing the persisted step only means a refresh starts a step earlier.
  void fetch("/api/session/setup-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step }),
  }).catch(() => {});
}

export default function SetupWizard({
  initialStep,
  hasUpload,
  uploadFilename,
  specialtyId: initialSpecialtyId,
  coverId: initialCoverId,
  paid,
  priceLabelPt,
}: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [uploaded, setUploaded] = useState(hasUpload);
  const [filename, setFilename] = useState(uploadFilename);
  const [specialtyId, setSpecialtyId] = useState(initialSpecialtyId ?? "");
  const [coverId, setCoverId] = useState(initialCoverId ?? "");

  // Furthest step the student may jump to: every earlier decision must exist.
  const maxReachable: WizardStep = !uploaded ? 1 : !specialtyId ? 2 : !coverId ? 3 : 4;

  const stepComplete: Record<WizardStep, boolean> = {
    1: uploaded,
    2: specialtyId !== "",
    3: coverId !== "",
    4: false,
  };

  function goTo(next: WizardStep) {
    if (next > maxReachable) return;
    setStep(next);
    persistStep(next);
  }

  const validationHintPt: Record<WizardStep, string> = {
    1: "Carrega o teu currículo para continuar.",
    2: "Escolhe a tua especialidade para continuar.",
    3: "Escolhe uma capa para veres a pré-visualização.",
    4: "",
  };

  return (
    <section className={styles.wizard} aria-label="Preparar o currículo">
      <ol className={styles.stepper}>
        {STEPS.map(({ step: n, labelPt }) => {
          const state = n === step ? "current" : stepComplete[n] ? "complete" : "upcoming";
          const reachable = n <= maxReachable;
          return (
            <li key={n} className={styles.stepperItem} data-state={state}>
              <button
                type="button"
                className={styles.stepperButton}
                onClick={() => goTo(n)}
                disabled={!reachable}
                aria-current={n === step ? "step" : undefined}
              >
                <span className={styles.stepperIndex} aria-hidden="true">
                  {state === "complete" ? <Icon name="check" size={12} /> : n}
                </span>
                <span className={styles.stepperLabel}>{labelPt}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 4 ? (
        // The workspace supplies its own frame (full-bleed two-pane layout,
        // DIO-38) and its own way back into steps, so no panel and no nav.
        <Workspace
          uploadFilename={filename}
          specialtyId={specialtyId}
          coverId={coverId}
          paid={paid}
          priceLabelPt={priceLabelPt}
          onCoverSaved={setCoverId}
          onEditUpload={() => goTo(1)}
          onEditSpecialty={() => goTo(2)}
        />
      ) : (
        <div className={styles.panel}>
          {step === 1 && (
            <div className={styles.stepBody}>
              <h2 className={styles.stepTitle}>Carrega o teu currículo</h2>
              <p className={styles.patientDataNotice}>
                <Icon name="alert" size={16} className={styles.noticeIcon} />
                Antes de carregares: se o teu currículo mencionar doentes (por exemplo, na
                casuística), remove ou anonimiza essa informação — não é necessária para a
                formatação.
              </p>
              <UploadZone
                initialFilename={filename}
                onUploaded={(name) => {
                  setUploaded(true);
                  setFilename(name);
                }}
              />
            </div>
          )}

          {step === 2 && (
            <div className={styles.stepBody}>
              <h2 className={styles.stepTitle}>Escolhe a tua especialidade</h2>
              <SpecialtySelect
                initialSpecialtyId={specialtyId || undefined}
                onSaved={setSpecialtyId}
              />
            </div>
          )}

          {step === 3 && (
            <div className={styles.stepBody}>
              <h2 className={styles.stepTitle}>Escolhe a capa</h2>
              <CoverSelect initialCoverId={coverId || undefined} onSaved={setCoverId} />
            </div>
          )}

          <div className={styles.nav}>
            {step > 1 ? (
              <button
                type="button"
                className={styles.backButton}
                onClick={() => goTo((step - 1) as WizardStep)}
              >
                <Icon name="arrowLeft" size={14} /> Voltar
              </button>
            ) : (
              <span />
            )}

            <div className={styles.navForward}>
              {!stepComplete[step] && (
                <span className={styles.navHint}>{validationHintPt[step]}</span>
              )}
              <button
                type="button"
                className={styles.nextButton}
                onClick={() => goTo((step + 1) as WizardStep)}
                disabled={!stepComplete[step]}
              >
                Continuar <Icon name="chevronRight" size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
