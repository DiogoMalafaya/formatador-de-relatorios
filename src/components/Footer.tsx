import Link from "next/link";
import styles from "./Footer.module.css";

/**
 * Legal-page links (DIO-19), on every page via the root layout — the
 * privacy policy, terms, and refund policy each need to be reachable from
 * anywhere, not just linked from within one another.
 */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <Link href="/privacidade">Privacidade</Link>
      <Link href="/termos">Termos de Serviço</Link>
      <Link href="/reembolsos">Reembolso</Link>
    </footer>
  );
}
