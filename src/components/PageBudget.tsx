"use client";

import { useEffect, useId, useState } from "react";
import styles from "./PageBudget.module.css";

/**
 * Live page budget and the chapter-divider toggle (DIO-54, PRD US7), plus
 * the outer-edge chapter tabs toggle (DIO-58), which costs no pages.
 *
 * Shows "84 / 100 páginas" from the last preview render, and the exact cost
 * of turning dividers on or off before anything re-renders. Over the
 * profile's cap is a blocking warning: the workspace disables checkout and
 * the checkout route refuses it too.
 *
 * Loads its own state (`/api/session/page-budget`) so the wizard doesn't
 * have to carry it; `refreshKey` changes whenever a preview finishes.
 */

interface Budget {
  pages?: number;
  rendered: boolean;
  maxPages?: number;
  overCap: boolean;
  dividersOn: boolean;
  dividerPageCost?: number;
}

type Status =
  | { kind: "loading" }
  | { kind: "hidden" }
  | {
      kind: "ready";
      budget: Budget;
      dividersAvailable: boolean;
      tabsAvailable: boolean;
      tabsOn: boolean;
      blockedMessagePt?: string;
    };

interface PageBudgetProps {
  refreshKey: number;
  /** After a successful toggle: the current preview no longer matches. */
  onDividersChanged: (enabled: boolean) => void;
  /** Same, for the chapter tabs: the preview must re-render to show them. */
  onTabsChanged: (enabled: boolean) => void;
  /** The blocking message while over the cap, `null` otherwise. */
  onBlockedChange: (messagePt: string | null) => void;
}

function pagesLabel(count: number): string {
  return count === 1 ? "1 página" : `${count} páginas`;
}

export default function PageBudget({ refreshKey, onDividersChanged, onTabsChanged, onBlockedChange }: PageBudgetProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleId = useId();
  const tabsToggleId = useId();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/session/page-budget");
        const body = (await response.json().catch(() => null)) as
          | {
              ok: true;
              available: true;
              budget: Budget;
              dividersAvailable: boolean;
              tabsAvailable?: boolean;
              tabsOn?: boolean;
              blockedMessagePt?: string;
            }
          | { ok: true; available: false }
          | { ok: false }
          | null;
        if (cancelled) return;
        if (!body || !body.ok || !body.available) {
          setStatus({ kind: "hidden" });
          onBlockedChange(null);
          return;
        }
        setStatus({
          kind: "ready",
          budget: body.budget,
          dividersAvailable: body.dividersAvailable,
          tabsAvailable: body.tabsAvailable === true,
          tabsOn: body.tabsOn === true,
          ...(body.blockedMessagePt ? { blockedMessagePt: body.blockedMessagePt } : {}),
        });
        onBlockedChange(body.blockedMessagePt ?? null);
      } catch {
        if (!cancelled) setStatus({ kind: "hidden" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reloadKey, onBlockedChange]);

  async function toggle(route: "chapter-dividers" | "chapter-tabs", enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/session/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error("toggle failed");
      if (route === "chapter-dividers") onDividersChanged(enabled);
      else onTabsChanged(enabled);
      setReloadKey((key) => key + 1);
    } catch {
      setError("Não foi possível guardar a opção. Tenta novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (status.kind !== "ready") return null;
  const { budget, dividersAvailable, tabsAvailable, tabsOn, blockedMessagePt } = status;
  const cost = budget.dividerPageCost;
  const fill =
    budget.pages !== undefined && budget.maxPages !== undefined
      ? Math.min(100, (budget.pages / budget.maxPages) * 100)
      : undefined;

  return (
    <section className={styles.budget} aria-labelledby={`${toggleId}-label`}>
      <h3 id={`${toggleId}-label`} className={styles.label}>
        Páginas
      </h3>

      {budget.pages !== undefined ? (
        <>
          <p className={styles.count} data-over={budget.overCap || undefined}>
            <span className={styles.countValue}>{budget.pages}</span>
            {budget.maxPages !== undefined ? ` / ${budget.maxPages} páginas` : budget.pages === 1 ? " página" : " páginas"}
          </p>
          {fill !== undefined && (
            <div className={styles.meter} aria-hidden="true">
              <div className={styles.meterFill} data-over={budget.overCap || undefined} style={{ width: `${fill}%` }} />
            </div>
          )}
          {!budget.rendered && (
            <p className={styles.hint}>Contagem prevista: gera a pré-visualização de novo para a veres.</p>
          )}
        </>
      ) : (
        <p className={styles.hint}>
          Gera a pré-visualização para contar as páginas
          {budget.maxPages !== undefined ? ` (limite do Colégio: ${budget.maxPages}).` : "."}
        </p>
      )}

      {blockedMessagePt && (
        <p className={styles.blocked} role="alert">
          {blockedMessagePt}
        </p>
      )}

      {dividersAvailable && (
        <div className={styles.option}>
          <input
            id={toggleId}
            type="checkbox"
            className={styles.checkbox}
            checked={budget.dividersOn}
            disabled={saving}
            onChange={(event) => void toggle("chapter-dividers", event.target.checked)}
          />
          <label htmlFor={toggleId} className={styles.optionText}>
            <span className={styles.optionTitle}>Separadores de capítulo</span>
            <span className={styles.optionHint}>
              Uma página com o número e o título antes de cada capítulo
              {cost !== undefined && cost > 0
                ? budget.dividersOn
                  ? ` (${pagesLabel(cost)} incluídas).`
                  : ` (+${pagesLabel(cost)}).`
                : "."}
            </span>
          </label>
        </div>
      )}

      {tabsAvailable && (
        <div className={styles.option}>
          <input
            id={tabsToggleId}
            type="checkbox"
            className={styles.checkbox}
            checked={tabsOn}
            disabled={saving}
            onChange={(event) => void toggle("chapter-tabs", event.target.checked)}
          />
          <label htmlFor={tabsToggleId} className={styles.optionText}>
            <span className={styles.optionTitle}>Marcadores de capítulo</span>
            <span className={styles.optionHint}>
              Na margem exterior, para encontrares cada capítulo na versão impressa. Não acrescenta páginas.
            </span>
          </label>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
