import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { PUBLIC_RETENTION_HOURS } from "@/lib/storage/types";

export const metadata: Metadata = { title: "Política de Privacidade — Formatador de Relatórios" };

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Política de Privacidade">
      <p>
        Não precisas de criar conta para usar este site. Isso significa que a maior parte dos
        dados que uma política de privacidade normalmente trata — email, password, histórico —
        simplesmente não existe aqui. O que recolhemos é o mínimo para reformatar o teu currículo
        e, se quiseres, processar o pagamento.
      </p>

      <h2>O que carregas</h2>
      <p>
        O ficheiro .docx do teu currículo de internato, a especialidade e o modelo de capa que
        escolheres. É armazenado num bucket alojado na União Europeia.
      </p>

      <h2>Quanto tempo guardamos os ficheiros</h2>
      <p>
        Os ficheiros são eliminados no máximo {PUBLIC_RETENTION_HOURS} horas depois de os
        carregares — quer tenhas pago, quer não. Na prática, a eliminação acontece minutos depois
        de descarregares o teu currículo; as {PUBLIC_RETENTION_HOURS} horas são o pior cenário,
        para sessões abandonadas.
      </p>

      <h2>Dados sobre doentes</h2>
      <p>
        Se o teu currículo referir doentes (por exemplo, na casuística), remove ou anonimiza essa
        informação antes de carregares o ficheiro — vês um aviso sobre isto no passo de
        carregamento. Não precisamos dessa informação para reformatar o documento.
      </p>

      <h2>Pagamento</h2>
      <p>
        Se decidires descarregar a versão final sem marca de água, o pagamento é processado
        diretamente pela Stripe. Este site nunca vê nem armazena o número do teu cartão — a
        Stripe recebe os dados de pagamento e, tipicamente, o teu email para o recibo, geridos
        segundo a política de privacidade própria da Stripe.
      </p>

      <h2>Sem contas, sem perfil</h2>
      <p>
        Não guardamos nenhum identificador teu além do que está dentro do próprio ficheiro que
        carregaste, e esse ficheiro desaparece automaticamente dentro da janela acima. Não há um
        perfil persistente para consultar, corrigir ou apagar depois disso — porque não existe.
      </p>

      <h2>Alterações a esta política</h2>
      <p>
        Esta página pode ser atualizada; a versão em vigor é sempre a publicada aqui. O número de
        horas indicado acima corresponde ao que o sistema efetivamente aplica — se esse valor
        mudar, esta página muda com ele.
      </p>
    </LegalPageLayout>
  );
}
