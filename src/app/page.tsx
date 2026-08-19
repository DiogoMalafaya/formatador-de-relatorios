import styles from "./page.module.css";

/**
 * Placeholder landing page (DIO-5).
 *
 * The real upload flow lands in DIO-8. This page exists to prove the scaffold
 * works end to end: the app renders, Portuguese diacritics survive the build,
 * and the backend route is reachable from the deployed frontend.
 */
export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Formatador de Relatórios</h1>
        <p>
          Formatação automática do currículo de internato segundo as normas do
          Colégio da especialidade. Em construção.
        </p>
        <p className={styles.diacritics} lang="pt-PT">
          ã õ ç é ê í ó ú Ã Õ Ç É Ê Í Ó Ú
        </p>
        <p>
          <a href="/api/health">Verificar o estado do serviço</a>
        </p>
      </main>
    </div>
  );
}
