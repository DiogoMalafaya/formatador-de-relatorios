import styles from "./DocumentMock.module.css";

/**
 * Stylised, pure-CSS impression of the output document (DIO-37): a compliant
 * cover sheet over a body page with the name + page-number footer the norms
 * require. Decorative only — real covers are typographic-variant templates
 * (DIO-12), and photographs/graphics are forbidden in the actual document, so
 * this stays an abstract paper mock rather than a screenshot.
 */
export default function DocumentMock() {
  return (
    <div className={styles.stack} aria-hidden="true">
      <div className={`${styles.sheet} ${styles.bodySheet}`}>
        <span className={`${styles.line} ${styles.lineHeading}`} />
        <span className={styles.line} style={{ width: "92%" }} />
        <span className={styles.line} style={{ width: "88%" }} />
        <span className={styles.line} style={{ width: "95%" }} />
        <span className={styles.line} style={{ width: "60%" }} />
        <span className={`${styles.line} ${styles.lineHeading}`} style={{ width: "44%" }} />
        <span className={styles.line} style={{ width: "90%" }} />
        <span className={styles.line} style={{ width: "84%" }} />
        <div className={styles.sheetFooter}>
          <span className={styles.footerName} />
          <span className={styles.footerPage} />
        </div>
      </div>

      <div className={`${styles.sheet} ${styles.coverSheet}`}>
        <span className={styles.coverName} />
        <span className={styles.coverTitle}>Curriculum Vitae</span>
        <span className={styles.coverRule} />
        <span className={styles.coverDetail} />
        <span className={styles.coverDetail} style={{ width: "34%" }} />
      </div>
    </div>
  );
}
