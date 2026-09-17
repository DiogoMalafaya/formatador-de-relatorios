import Link from "next/link";
import styles from "./LegalPageLayout.module.css";

/**
 * Shared shell for the legal pages (DIO-19) — privacy policy, terms of
 * service, refund policy. Server-rendered, static content only, so the
 * three pages differ only in what's passed as children.
 */

interface LegalPageLayoutProps {
  title: string;
  children: React.ReactNode;
}

export default function LegalPageLayout({ title, children }: LegalPageLayoutProps) {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link href="/" className={styles.back}>
          ← Formatador de Relatórios
        </Link>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
