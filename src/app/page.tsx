import SpecialtySelect from "@/components/SpecialtySelect";
import UploadZone from "@/components/UploadZone";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Formatador de Relatórios</h1>
        <p>
          Formatação automática do currículo de internato segundo as normas do
          Colégio da especialidade.
        </p>
        <UploadZone />
        <SpecialtySelect />
      </main>
    </div>
  );
}
