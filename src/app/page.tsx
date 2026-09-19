import DownloadPanel from "@/components/DownloadPanel";
import HeroRenders from "@/components/HeroRenders";
import Icon from "@/components/Icon";
import SetupWizard, { type WizardStep } from "@/components/SetupWizard";
import { PRICE_EUR_CENTS } from "@/lib/payment/pricing";
import { getCurrentSession } from "@/lib/session/cookies";
import type { SessionRecord } from "@/lib/session";
import styles from "./page.module.css";

interface HomeProps {
  searchParams: Promise<{ pagamento?: string }>;
}

/**
 * Formats the one price (DIO-14 pricing lib) server-side, so no client
 * component ever hardcodes an amount that could drift from what Stripe
 * charges. Whole-euro amounts render without cents ("150 €", not "150,00 €").
 */
function formatPricePt(): string {
  const euros = PRICE_EUR_CENTS / 100;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(euros) ? 0 : 2,
  }).format(euros);
}

/**
 * Where the wizard should open (DIO-37): the persisted step when it is still
 * reachable, otherwise the furthest step the record's actual state supports —
 * the record, not the persisted number, decides what counts as completed.
 */
function resolveInitialStep(session: SessionRecord | null): WizardStep {
  const maxReachable: WizardStep = !session?.upload
    ? 1
    : !session.specialtyId
      ? 2
      : !session.coverId
        ? 3
        : 4;

  const stored = session?.setupStep;
  if (typeof stored === "number" && Number.isInteger(stored) && stored >= 1 && stored < maxReachable) {
    return stored as WizardStep;
  }
  return maxReachable;
}

export default async function Home({ searchParams }: HomeProps) {
  const { pagamento } = await searchParams;
  const priceLabelPt = formatPricePt();

  // A fresh checkout without SESSION_SIGNING_SECRET configured must degrade to
  // "no session" rather than take down the landing page.
  let session: SessionRecord | null = null;
  try {
    session = await getCurrentSession();
  } catch {
    session = null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.navbar}>
          <a href="#" className={styles.wordmark} aria-label="Lauda — início">
            lauda
          </a>
          <nav className={styles.navLinks} aria-label="Secções">
            <a href="#" className={styles.navLinkActive} aria-current="page">
              Início
            </a>
            <a href="#como-funciona" className={styles.navLink}>
              Como funciona
            </a>
            <a href="#preco" className={styles.navLink}>
              Preço
            </a>
          </nav>
          <a className={styles.navCta} href="#preparar">
            Começar
          </a>
        </header>

        <section className={styles.hero} aria-label="Apresentação">
          <HeroRenders />

          <div className={styles.heroText}>
            <span className={styles.heroBadge}>
              <Icon name="sparkles" size={12} /> Pré-visualização gratuita
              <Icon name="chevronRight" size={12} />
            </span>
            <h1 className={styles.heroTitle}>
              O teu currículo, formatado segundo as{" "}
              <em className={styles.heroAccent}>normas</em> do Colégio.
            </h1>
            <p className={styles.heroLead}>
              Carrega o teu currículo em .docx e recebe um PDF pronto para a discussão
              curricular — tipografia, margens, rodapé e capa conforme as normas da tua
              especialidade.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.heroCta} href="#preparar">
                Começar agora
              </a>
              <a className={styles.heroGhost} href="#como-funciona">
                Como funciona <Icon name="chevronRight" size={14} />
              </a>
            </div>
          </div>

        </section>
      </div>

      <main className={styles.main}>
        <section id="como-funciona" className={styles.beats} aria-labelledby="beats-title">
          <header className={styles.sectionHeader}>
            <p className={styles.eyebrow}>Como funciona</p>
            <h2 id="beats-title" className={styles.sectionTitle}>
              Carregas, revês e descarregas.
            </h2>
          </header>

          <div className={styles.beatGrid}>
            <article className={styles.beat}>
              <span className={styles.beatIcon}>
                <Icon name="sparkles" size={18} />
              </span>
              <h3 className={styles.beatTitle}>O que faz</h3>
              <p className={styles.beatText}>
                Aplica as normas do Colégio ao teu documento: tipo de letra, corpo 12,
                espaçamento 1,5, margens de 2,5 cm, rodapé com o teu nome e número de
                página — e uma capa conforme.
              </p>
            </article>
            <article className={styles.beat}>
              <span className={styles.beatIcon}>
                <Icon name="graduationCap" size={18} />
              </span>
              <h3 className={styles.beatTitle}>Para quem</h3>
              <p className={styles.beatText}>
                Para internos em fim de internato a preparar a Prova de Discussão
                Curricular. Sem conta, sem instalação: carregas, revês e descarregas.
              </p>
            </article>
            <article id="preco" className={`${styles.beat} ${styles.beatPriceCard}`}>
              <span className={styles.beatIcon}>
                <Icon name="euro" size={18} />
              </span>
              <h3 className={styles.beatTitle}>Quanto custa</h3>
              <p className={styles.beatPrice}>
                {priceLabelPt}
                <span className={styles.beatPriceNote}>pagamento único</span>
              </p>
              <p className={styles.beatText}>
                A pré-visualização é gratuita, com marca de água. Pagas uma única vez pelo
                PDF final, sem marca de água.
              </p>
            </article>
          </div>
        </section>

        <section id="preparar" className={styles.setup} aria-labelledby="setup-title">
          <header className={styles.sectionHeader}>
            <p className={styles.eyebrow}>Começar</p>
            <h2 id="setup-title" className={styles.sectionTitle}>
              Prepara o teu currículo
            </h2>
          </header>

          {pagamento === "cancelado" && (
            <p className={styles.paymentNotice} role="status">
              Pagamento cancelado. O teu currículo continua disponível — podes tentar
              novamente.
            </p>
          )}
          {pagamento === "sucesso" && (
            <div className={styles.downloadCard}>
              <DownloadPanel />
            </div>
          )}

          <SetupWizard
            initialStep={resolveInitialStep(session)}
            hasUpload={Boolean(session?.upload)}
            uploadFilename={session?.upload?.originalFilename}
            specialtyId={session?.specialtyId}
            coverId={session?.coverId}
            priceLabelPt={priceLabelPt}
          />
        </section>
      </main>
    </div>
  );
}
