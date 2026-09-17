"use client";

import { useState } from "react";
import { getSpecialtyById } from "@/lib/specialties";
import CheckoutButton from "./CheckoutButton";
import CoverSelect from "./CoverSelect";
import DownloadPanel from "./DownloadPanel";
import FormattingSummary from "./FormattingSummary";
import FormattingWarnings from "./FormattingWarnings";
import PreviewPane from "./PreviewPane";
import styles from "./Workspace.module.css";

/**
 * Two-pane document workspace (DIO-38), the wizard's final step.
 *
 * Right pane is dominated by the preview (≥60% of the viewport on desktop —
 * the container breaks out of the page column to make that true). Left rail
 * rehomes the formatting summary (DIO-17), warnings (DIO-18), document and
 * specialty facts with jump-back affordances into the wizard, and the cover
 * gallery (DIO-12) so a cover change never leaves the workspace.
 *
 * The one primary action — checkout before payment (DIO-14), download after
 * (DIO-15) — is anchored so it stays visible without scrolling: as the sticky
 * rail's footer on desktop, as a fixed bottom bar on mobile.
 *
 * Everything here is client state over the same server session record the
 * wizard uses: changing an option re-renders in place, so the page never
 * navigates and scroll position is preserved. The preview is remounted (via
 * `key`) when the cover changes, which discards the now-stale render and
 * offers a fresh one — PreviewPane's internals are deliberately untouched
 * (its viewer is being replaced separately, build order 3/6).
 */

interface WorkspaceProps {
  uploadFilename?: string;
  specialtyId: string;
  coverId: string;
  /** Payment state as the server rendered it; DownloadPanel re-verifies by polling. */
  paid: boolean;
  /** Formatted server-side from the pricing lib; see CheckoutButton. */
  priceLabelPt: string;
  /** Mirrors the wizard's cover state so leaving and revisiting keeps the choice. */
  onCoverSaved: (coverId: string) => void;
  onEditUpload: () => void;
  onEditSpecialty: () => void;
}

export default function Workspace({
  uploadFilename,
  specialtyId,
  coverId,
  paid,
  priceLabelPt,
  onCoverSaved,
  onEditUpload,
  onEditSpecialty,
}: WorkspaceProps) {
  // Mobile-only accordion state; on desktop the CSS shows the rail regardless.
  const [railOpen, setRailOpen] = useState(false);

  const specialtyName = getSpecialtyById(specialtyId)?.name ?? specialtyId;

  return (
    <div className={styles.workspace}>
      <div className={styles.grid}>
        <div className={styles.previewCol}>
          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <h3 className={styles.previewTitle}>Pré-visualização</h3>
              <p className={styles.previewHint}>
                Gratuita, com marca de água. Se mudares a capa, gera uma nova
                pré-visualização.
              </p>
            </div>
            <div className={styles.previewSlot}>
              <PreviewPane key={coverId} />
            </div>
          </div>
        </div>

        <aside className={styles.rail} aria-label="Resumo e opções">
          <div className={styles.railScroll}>
            <FormattingWarnings />

            <button
              type="button"
              className={styles.railToggle}
              aria-expanded={railOpen}
              onClick={() => setRailOpen((open) => !open)}
            >
              Resumo e opções
              <span className={styles.railToggleChevron} aria-hidden="true">
                ▾
              </span>
            </button>

            <div className={styles.railBody} data-open={railOpen || undefined}>
              <section className={styles.railSection}>
                <div className={styles.railSectionHead}>
                  <h3 className={styles.railLabel}>Documento</h3>
                  <button type="button" className={styles.editButton} onClick={onEditUpload}>
                    Alterar
                  </button>
                </div>
                <p className={styles.railValue}>{uploadFilename ?? "Currículo carregado"}</p>
              </section>

              <section className={styles.railSection}>
                <div className={styles.railSectionHead}>
                  <h3 className={styles.railLabel}>Especialidade</h3>
                  <button type="button" className={styles.editButton} onClick={onEditSpecialty}>
                    Alterar
                  </button>
                </div>
                <p className={styles.railValue}>{specialtyName}</p>
              </section>

              <section className={styles.railSection}>
                <CoverSelect initialCoverId={coverId || undefined} onSaved={onCoverSaved} />
              </section>

              <section className={styles.railSection}>
                <div className={styles.railSectionHead}>
                  <h3 className={styles.railLabel}>Formatação</h3>
                </div>
                <FormattingSummary />
              </section>
            </div>
          </div>

          <div className={styles.actionBar}>
            {paid ? (
              <DownloadPanel />
            ) : (
              <>
                <CheckoutButton priceLabelPt={priceLabelPt} />
                <p className={styles.actionNote}>
                  Pagas uma única vez — sem conta, sem subscrição.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
