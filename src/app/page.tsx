import CheckoutButton from "@/components/CheckoutButton";
import CoverSelect from "@/components/CoverSelect";
import PreviewPane from "@/components/PreviewPane";
import SpecialtySelect from "@/components/SpecialtySelect";
import UploadZone from "@/components/UploadZone";
import styles from "./page.module.css";

interface HomeProps {
  searchParams: Promise<{ pagamento?: string }>;
}

/**
 * Banner for the round trip back from Stripe Checkout (DIO-14). The webhook
 * (DIO-15), not this redirect, is what actually marks the session paid — this
 * is only here so cancelling or succeeding doesn't land the student on a dead
 * end. DIO-15 replaces the "sucesso" branch with the real polling + download.
 */
function PaymentBanner({ pagamento }: { pagamento?: string }) {
  if (pagamento === "cancelado") {
    return (
      <p className={styles.paymentNotice}>
        Pagamento cancelado. O teu currículo continua disponível — podes tentar novamente.
      </p>
    );
  }
  if (pagamento === "sucesso") {
    return (
      <p className={styles.paymentNotice}>
        Pagamento recebido. Estamos a confirmá-lo — o download vai ficar disponível em breve.
      </p>
    );
  }
  return null;
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
        <PaymentBanner pagamento={pagamento} />
        <UploadZone />
        <SpecialtySelect />
        <CoverSelect />
        <PreviewPane />
        <CheckoutButton />
      </main>
    </div>
  );
}
