import CheckoutButton from "@/components/CheckoutButton";
import CoverSelect from "@/components/CoverSelect";
import DownloadPanel from "@/components/DownloadPanel";
import FormattingSummary from "@/components/FormattingSummary";
import PreviewPane from "@/components/PreviewPane";
import SpecialtySelect from "@/components/SpecialtySelect";
import UploadZone from "@/components/UploadZone";
import styles from "./page.module.css";

interface HomeProps {
  searchParams: Promise<{ pagamento?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { pagamento } = await searchParams;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Formatador de Relatórios</h1>
        <p>
          Formatação automática do currículo de internato segundo as normas do
          Colégio da especialidade.
        </p>

        {pagamento === "cancelado" && (
          <p className={styles.paymentNotice}>
            Pagamento cancelado. O teu currículo continua disponível — podes tentar novamente.
          </p>
        )}
        {pagamento === "sucesso" && <DownloadPanel />}

        <UploadZone />
        <SpecialtySelect />
        <CoverSelect />
        <FormattingSummary />
        <PreviewPane />
        <CheckoutButton />
      </main>
    </div>
  );
}
