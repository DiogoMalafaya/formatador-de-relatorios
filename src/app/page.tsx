import DocumentMock from "@/components/DocumentMock";
import DownloadPanel from "@/components/DownloadPanel";
import SetupWizard from "@/components/SetupWizard";
import { PRICE_EUR_CENTS } from "@/lib/payment/pricing";
import { getCurrentSession } from "@/lib/session/cookies";
import type { SessionRecord } from "@/lib/session";
import { maxReachableStep, resolveInitialSetupStep } from "@/lib/wizard/initialStep";
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

  // The workspace (DIO-38) anchors DownloadPanel as its primary action once
  // the payment is known — either from the record (webhook-fed) or from the
  // Stripe success redirect, which can arrive before the webhook lands;
  // DownloadPanel itself polls the record and never trusts the redirect.
  const paid = pagamento === "sucesso" || session?.payment.status === "paid";
  // Edge case: a success redirect whose session no longer reaches the
  // workspace (e.g. lost cookie) still deserves the download/confirmation
  // panel instead of silently restarting the wizard.
  const orphanedSuccess = pagamento === "sucesso" && maxReachableStep(session) < 4;

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <span className={styles.brand}>Formatador de Relatórios</span>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-label="Apresentação">
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Para internos de formação especializada</p>
            <h1 className={styles.heroTitle}>
              O teu currículo, formatado segundo as normas do Colégio.
            </h1>
            <p className={styles.heroLead}>
              Carrega o teu currículo em .docx e recebe um PDF pronto para a discussão
              curricular — tipografia, margens, rodapé e capa conforme as normas da tua
              especialidade.
            </p>
            <a className={styles.heroCta} href="#preparar">
              Começar agora
            </a>
          </div>
          <div className={styles.heroVisual}>
            <DocumentMock />
          </div>
        </section>

        <section className={styles.beats} aria-label="Como funciona">
          <div className={styles.beat}>
            <h2 className={styles.beatTitle}>O que faz</h2>
            <p className={styles.beatText}>
              Aplica as normas do Colégio ao teu documento: tipo de letra, corpo 12,
              espaçamento 1,5, margens de 2,5 cm, rodapé com o teu nome e número de
              página — e uma capa conforme.
            </p>
          </div>
          <div className={styles.beat}>
            <h2 className={styles.beatTitle}>Para quem</h2>
            <p className={styles.beatText}>
              Para internos em fim de internato a preparar a Prova de Discussão
              Curricular. Sem conta, sem instalação: carregas, revês e descarregas.
            </p>
          </div>
          <div className={styles.beat}>
            <h2 className={styles.beatTitle}>Quanto custa</h2>
            <p className={styles.beatPrice}>{priceLabelPt}</p>
            <p className={styles.beatText}>
              A pré-visualização é gratuita, com marca de água. Pagas uma única vez pelo
              PDF final, sem marca de água.
            </p>
          </div>
        </section>

        <section id="preparar" className={styles.setup} aria-label="Preparar o currículo">
          <h2 className={styles.setupTitle}>Prepara o teu currículo</h2>

          {pagamento === "cancelado" && (
            <p className={styles.paymentNotice}>
              Pagamento cancelado. O teu currículo continua disponível — podes tentar
              novamente.
            </p>
          )}
          {orphanedSuccess && (
            <div className={styles.downloadCard}>
              <DownloadPanel />
            </div>
          )}

          <SetupWizard
            initialStep={resolveInitialSetupStep(session)}
            hasUpload={Boolean(session?.upload)}
            uploadFilename={session?.upload?.originalFilename}
            specialtyId={session?.specialtyId}
            coverId={session?.coverId}
            paid={paid}
            priceLabelPt={priceLabelPt}
          />
        </section>
      </main>
    </div>
  );
}
