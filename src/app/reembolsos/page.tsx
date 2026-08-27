import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = { title: "Política de Reembolso — Formatador de Relatórios" };

/**
 * Default terms, not yet confirmed by Diogo (DIO-19 ticket comment) — flagged
 * on the ticket. Common-sense default for a one-off digital deliverable: full
 * refund before the paid file is downloaded, since nothing has been delivered
 * yet; no refund after, since it has.
 */
export default function RefundPolicyPage() {
  return (
    <LegalPageLayout title="Política de Reembolso">
      <p>
        O que pagas é o download do ficheiro final sem marca de água — a pré-visualização com
        marca de água é sempre gratuita, por isso podes confirmar o resultado antes de decidires
        pagar.
      </p>

      <h2>Antes de descarregares o ficheiro final</h2>
      <p>
        Se pagaste mas ainda não descarregaste o ficheiro final, tens direito a reembolso total —
        o serviço ainda não foi entregue.
      </p>

      <h2>Depois de descarregares o ficheiro final</h2>
      <p>
        Depois de descarregares o ficheiro final, consideramos o serviço prestado e já não é
        possível reembolso, exceto se o ficheiro entregue estiver corrompido, ilegível, ou não
        corresponder ao que foi pré-visualizado — nesse caso, contacta-nos e temos todo o gosto
        em corrigir o problema ou reembolsar-te.
      </p>

      <h2>Como pedir um reembolso</h2>
      <p>
        Responde ao email de confirmação de pagamento que recebes da Stripe, indicando o motivo
        do pedido.
      </p>
    </LegalPageLayout>
  );
}
