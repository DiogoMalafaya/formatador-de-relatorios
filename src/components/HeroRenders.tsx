import Image from "next/image";
import styles from "./HeroRenders.module.css";

/**
 * The hero's backdrop (PRD US5: a visual of the output document): a tilted
 * wall of real pages produced by our own pipeline — formatting engine, cover
 * merge and Chromium PDF — for three fictional CVs. It sits behind the sage
 * gradient, so the dark side keeps the headline legible and the light side
 * lets the pages show through.
 *
 * The images are generated, not drawn: `node scripts/render-hero-samples.mts`
 * re-renders them after any visible change to the engine or the covers.
 * Decorative only — hidden from assistive tech.
 */

const PAGE_WIDTH = 520;
const PAGE_HEIGHT = 734;

/** sample-{cv}-{page}: page 1 is the cover. Ordered so neighbours differ. */
const COLUMNS: string[][] = [
  ["1-2", "2-1", "3-3"],
  ["2-3", "3-2", "1-1"],
  ["3-1", "1-3", "2-4"],
  ["1-4", "2-2", "3-4"],
  ["2-1", "3-3", "1-2"],
  ["3-2", "1-1", "2-3"],
  ["1-3", "2-4", "3-1"],
];

export default function HeroRenders() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.wall}>
        {COLUMNS.map((column, columnIndex) => (
          <div key={columnIndex} className={styles.column}>
            {column.map((page) => (
              <Image
                key={page}
                className={styles.page}
                src={`/hero/sample-${page}.jpg`}
                alt=""
                width={PAGE_WIDTH}
                height={PAGE_HEIGHT}
                sizes="180px"
                priority={columnIndex >= 3}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
