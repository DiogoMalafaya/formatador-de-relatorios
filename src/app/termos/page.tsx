import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = { title: "Termos de Serviço — Formatador de Relatórios" };

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Termos de Serviço">
      <p>Ao usares este site, aceitas os termos abaixo.</p>

      <h2>O serviço</h2>
      <p>
        O Formatador de Relatórios reformata o teu currículo de internato (.docx) segundo as
        normas publicadas pelo Colégio da tua especialidade, junta uma capa, e mostra-te uma
        pré-visualização gratuita com marca de água. O download do ficheiro final, sem marca de
        água, é pago — ver a{" "}
        <Link href="/reembolsos">Política de Reembolso</Link> para as condições.
      </p>

      <h2>A tua responsabilidade sobre o resultado</h2>
      <p>
        A formatação automática aplica as normas conhecidas para a tua especialidade, mas a
        responsabilidade final por confirmar que o currículo cumpre as normas antes de o
        submeteres é tua. Revê sempre o resultado antes de o entregares.
      </p>

      <h2>Pagamento</h2>
      <p>
        O pagamento é processado pela Stripe; o preço exato é mostrado antes de pagares. Este
        site nunca vê nem armazena os dados do teu cartão.
      </p>

      <h2>Sem conta, sem disponibilidade garantida</h2>
      <p>
        Este é um serviço de utilização pontual, sem conta — ver a{" "}
        <Link href="/privacidade">Política de Privacidade</Link> para a janela de retenção dos
        teus ficheiros. Não garantimos que um ficheiro fique disponível além dessa janela.
      </p>

      <h2>Alterações a estes termos</h2>
      <p>Estes termos podem ser atualizados; a versão em vigor é sempre a publicada nesta página.</p>
    </LegalPageLayout>
  );
}
