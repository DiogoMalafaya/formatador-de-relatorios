"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getDocument,
  PDFWorker,
  RenderingCancelledException,
} from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import styles from "./PdfViewer.module.css";
import {
  MAX_SCALE,
  MIN_SCALE,
  canvasPixelScale,
  fitPageScale,
  fitWidthScale,
  pageIndexAtScrollCenter,
  stackLayout,
  stepScale,
} from "./viewerMath";

/**
 * Custom pdf.js viewer for the watermarked preview (DIO-39): pages rendered
 * onto canvases in a scrollable stack, under our own chrome (thumbnails,
 * zoom, page indicator) — no browser PDF UI, and deliberately no download or
 * print affordance. The clean PDF stays behind the webhook-gated download
 * route; this component only ever sees the bytes the preview endpoint
 * already serves.
 */

/** Vertical gap between pages; fed to both CSS and the scroll math. */
const PAGE_GAP = 16;
/** Padding around the page stack; likewise shared with the CSS. */
const STACK_PADDING = 24;
/** CSS width of a sidebar thumbnail. */
const THUMB_WIDTH = 88;

const VIEWER_ERROR_PT =
  "Não foi possível apresentar a pré-visualização. Tenta novamente.";

/**
 * pdf.js parses documents inside a Web Worker. Turbopack bundles the
 * `new Worker(new URL(...))` expression, so the worker script ships from our
 * own origin — no CDN. One worker serves every document this tab opens;
 * passing it to getDocument explicitly means loadingTask.destroy() tears
 * down the document but leaves the worker alive for the next preview.
 */
let sharedWorker: PDFWorker | null = null;

function getSharedPdfWorker(): PDFWorker {
  sharedWorker ??= new PDFWorker({
    // pdfjs-dist's generated typings declare `port` as `null | undefined`,
    // but the runtime accepts (and documents) a real Worker here.
    port: new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    ) as unknown as null,
  });
  return sharedWorker;
}

type ZoomMode =
  | { kind: "fit-width" }
  | { kind: "fit-page" }
  | { kind: "custom"; scale: number };

interface PageSize {
  width: number;
  height: number;
}

export default function PdfViewer({ data }: { data: ArrayBuffer }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState<ZoomMode>({ kind: "fit-width" });
  const [currentPage, setCurrentPage] = useState(1);
  // Client-only component (dynamic, ssr:false), so window exists on first
  // render and the initial DPR can be read directly.
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  const [containerSize, setContainerSize] = useState<PageSize | null>(null);
  const [visiblePages, setVisiblePages] = useState<ReadonlySet<number>>(
    () => new Set([0]),
  );
  const [visibleThumbs, setVisibleThumbs] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const thumbsRef = useRef<HTMLDivElement | null>(null);
  const pageElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const thumbElsRef = useRef<(HTMLButtonElement | null)[]>([]);
  /** Viewport anchor captured just before a zoom change, restored after. */
  const anchorRef = useRef<{ page: number; frac: number } | null>(null);

  // Load the document. The buffer is copied because pdf.js transfers it to
  // the worker (detaching it), and a re-mount must be able to load again.
  useEffect(() => {
    let disposed = false;
    const task = getDocument({
      data: new Uint8Array(data.slice(0)),
      worker: getSharedPdfWorker(),
    });

    (async () => {
      try {
        const loaded = await task.promise;
        // Fetch every page proxy up front: exact per-page dimensions make
        // the scroll math trustworthy, and the norms cap documents at 80
        // pages so this stays cheap.
        const pageList = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, i) =>
            loaded.getPage(i + 1),
          ),
        );
        if (disposed) return;
        // Also reset the per-document state, in case `data` ever changes
        // without a remount (today PreviewPane remounts the viewer).
        setDoc(loaded);
        setPages(pageList);
        setFailed(false);
        setCurrentPage(1);
        setVisiblePages(new Set([0]));
        setVisibleThumbs(new Set());
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      void task.destroy().catch(() => undefined);
    };
  }, [data]);

  // Track devicePixelRatio so a move between screens re-renders crisply.
  // The media query must be rebuilt after each change because it matches a
  // specific resolution value.
  useEffect(() => {
    let query: MediaQueryList | null = null;
    const onChange = () => {
      setDpr(window.devicePixelRatio || 1);
      arm();
    };
    const arm = () => {
      query?.removeEventListener("change", onChange);
      query = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      query.addEventListener("change", onChange);
    };
    arm();
    return () => query?.removeEventListener("change", onChange);
  }, []);

  // Container size drives the fit-width / fit-page scales.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const baseSizes: PageSize[] = useMemo(
    () =>
      pages.map((page) => {
        const viewport = page.getViewport({ scale: 1 });
        return { width: viewport.width, height: viewport.height };
      }),
    [pages],
  );

  const scale = useMemo(() => {
    if (zoom.kind === "custom") return zoom.scale;
    if (!containerSize || baseSizes.length === 0) return 1;
    const first = baseSizes[0];
    return zoom.kind === "fit-width"
      ? fitWidthScale(containerSize.width, first.width, STACK_PADDING)
      : fitPageScale(
          containerSize.width,
          containerSize.height,
          first.width,
          first.height,
          STACK_PADDING,
        );
  }, [zoom, containerSize, baseSizes]);

  const cssSizes: PageSize[] = useMemo(
    () =>
      baseSizes.map((size) => ({
        width: size.width * scale,
        height: size.height * scale,
      })),
    [baseSizes, scale],
  );

  const layout = useMemo(
    () =>
      stackLayout(
        cssSizes.map((size) => size.height),
        PAGE_GAP,
        STACK_PADDING,
      ),
    [cssSizes],
  );

  // Which pages are near the viewport (rendered), via IntersectionObserver
  // with a generous buffer. Far-away canvases are released so an 80-page
  // document does not hold 80 full-resolution bitmaps.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || pages.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const index = Number(
              (entry.target as HTMLElement).dataset.index,
            );
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      { root, rootMargin: "150% 0%" },
    );
    for (const el of pageElsRef.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [pages.length]);

  // Same pattern for thumbnails; on mobile the sidebar is display:none, so
  // nothing ever intersects and no thumbnail is rendered at all.
  useEffect(() => {
    const root = thumbsRef.current;
    if (!root || pages.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleThumbs((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const index = Number(
              (entry.target as HTMLElement).dataset.index,
            );
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      { root, rootMargin: "100% 0%" },
    );
    for (const el of thumbElsRef.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [pages.length]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const index = pageIndexAtScrollCenter(
      el.scrollTop,
      el.clientHeight,
      layout.tops,
      layout.heights,
    );
    setCurrentPage(index + 1);
  }, [layout]);

  // Restore the pre-zoom viewport anchor once the new layout has been
  // committed, so zooming keeps the same spot under the reader's eyes.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const el = scrollerRef.current;
    if (!anchor || !el) return;
    anchorRef.current = null;
    const top = layout.tops[anchor.page];
    const height = layout.heights[anchor.page];
    if (top === undefined) return;
    el.scrollTop = Math.max(0, top + anchor.frac * height - el.clientHeight / 2);
  }, [layout]);

  const applyZoom = useCallback(
    (next: ZoomMode) => {
      const el = scrollerRef.current;
      if (el && layout.tops.length > 0) {
        const index = pageIndexAtScrollCenter(
          el.scrollTop,
          el.clientHeight,
          layout.tops,
          layout.heights,
        );
        const center = el.scrollTop + el.clientHeight / 2;
        anchorRef.current = {
          page: index,
          frac:
            (center - layout.tops[index]) / Math.max(layout.heights[index], 1),
        };
      }
      setZoom(next);
    },
    [layout],
  );

  const goToPage = useCallback(
    (index: number) => {
      const el = scrollerRef.current;
      const top = layout.tops[index];
      if (!el || top === undefined) return;
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      el.scrollTo({
        top: Math.max(0, top - PAGE_GAP / 2),
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [layout],
  );

  // Keep the active thumbnail in view — scrolling only the sidebar, never
  // the page itself (scrollIntoView would move every ancestor).
  useEffect(() => {
    const sidebar = thumbsRef.current;
    const el = thumbElsRef.current[currentPage - 1];
    if (!sidebar || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < sidebar.scrollTop) {
      sidebar.scrollTop = top - 8;
    } else if (bottom > sidebar.scrollTop + sidebar.clientHeight) {
      sidebar.scrollTop = bottom - sidebar.clientHeight + 8;
    }
  }, [currentPage]);

  const onRenderError = useCallback(() => setFailed(true), []);

  if (failed) {
    return (
      <p className={styles.error} role="alert">
        {VIEWER_ERROR_PT}
      </p>
    );
  }

  const ready = doc !== null && pages.length > 0;

  return (
    <div
      className={styles.viewer}
      role="region"
      aria-label="Pré-visualização do currículo formatado, com marca de água"
    >
      <div className={styles.toolbar}>
        <span className={styles.pageIndicator}>
          {ready ? `Página ${currentPage} de ${pages.length}` : "A preparar…"}
        </span>
        <div
          className={styles.zoomControls}
          role="group"
          aria-label="Controlos de zoom"
        >
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => applyZoom({ kind: "custom", scale: stepScale(scale, -1) })}
            disabled={!ready || scale <= MIN_SCALE * 1.001}
            aria-label="Reduzir"
            title="Reduzir"
          >
            <ZoomOutIcon />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => applyZoom({ kind: "custom", scale: stepScale(scale, 1) })}
            disabled={!ready || scale >= MAX_SCALE * 0.999}
            aria-label="Ampliar"
            title="Ampliar"
          >
            <ZoomInIcon />
          </button>
          <span className={styles.toolDivider} aria-hidden="true" />
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => applyZoom({ kind: "fit-width" })}
            disabled={!ready}
            aria-pressed={zoom.kind === "fit-width"}
            aria-label="Ajustar à largura"
            title="Ajustar à largura"
          >
            <FitWidthIcon />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => applyZoom({ kind: "fit-page" })}
            disabled={!ready}
            aria-pressed={zoom.kind === "fit-page"}
            aria-label="Ajustar à página"
            title="Ajustar à página"
          >
            <FitPageIcon />
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {ready && pages.length > 1 && (
          <div
            className={styles.thumbs}
            ref={thumbsRef}
            aria-label="Miniaturas das páginas"
          >
            {pages.map((page, i) => (
              <button
                key={i}
                type="button"
                ref={(el) => {
                  thumbElsRef.current[i] = el;
                }}
                data-index={i}
                className={
                  currentPage === i + 1
                    ? `${styles.thumb} ${styles.thumbActive}`
                    : styles.thumb
                }
                onClick={() => goToPage(i)}
                aria-label={`Ir para a página ${i + 1}`}
                aria-current={currentPage === i + 1 ? "page" : undefined}
              >
                <ThumbCanvas
                  page={page}
                  width={THUMB_WIDTH}
                  active={visibleThumbs.has(i)}
                />
                <span className={styles.thumbLabel} aria-hidden="true">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          className={styles.scroller}
          ref={scrollerRef}
          onScroll={handleScroll}
          tabIndex={0}
        >
          {ready ? (
            <div
              className={styles.stack}
              style={{ gap: PAGE_GAP, padding: STACK_PADDING }}
            >
              {pages.map((page, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    pageElsRef.current[i] = el;
                  }}
                  data-index={i}
                  className={styles.page}
                  style={{
                    width: cssSizes[i].width,
                    height: cssSizes[i].height,
                  }}
                >
                  <PageCanvas
                    page={page}
                    scale={scale}
                    dpr={dpr}
                    shouldRender={visiblePages.has(i)}
                    onRenderError={onRenderError}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.skeleton} aria-hidden="true">
              <div className={styles.skeletonPage} />
              <div className={styles.skeletonPage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageCanvas({
  page,
  scale,
  dpr,
  shouldRender,
  onRenderError,
}: {
  page: PDFPageProxy;
  scale: number;
  dpr: number;
  shouldRender: boolean;
  onRenderError: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!shouldRender) {
      // Release the bitmap when the page scrolls far out of the buffer.
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    const viewport = page.getViewport({ scale });
    const output = canvasPixelScale(viewport.width, viewport.height, dpr);
    canvas.width = Math.floor(viewport.width * output);
    canvas.height = Math.floor(viewport.height * output);
    const task = page.render({
      canvas,
      viewport,
      transform: output !== 1 ? [output, 0, 0, output, 0, 0] : undefined,
    });
    task.promise.catch((error: unknown) => {
      if (!(error instanceof RenderingCancelledException)) onRenderError();
    });
    return () => task.cancel();
  }, [page, scale, dpr, shouldRender, onRenderError]);

  return <canvas ref={canvasRef} className={styles.pageCanvas} />;
}

function ThumbCanvas({
  page,
  width,
  active,
}: {
  page: PDFPageProxy;
  width: number;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderedRef = useRef(false);

  const base = page.getViewport({ scale: 1 });
  const height = Math.round((width * base.height) / base.width);

  useEffect(() => {
    // Thumbnails render once and keep their small bitmap; no need to redo
    // them on zoom or to release them on scroll.
    if (!active || renderedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewport = page.getViewport({
      scale: width / page.getViewport({ scale: 1 }).width,
    });
    const output = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * output);
    canvas.height = Math.floor(viewport.height * output);
    const task = page.render({
      canvas,
      viewport,
      transform: output !== 1 ? [output, 0, 0, output, 0, 0] : undefined,
    });
    task.promise.then(
      () => {
        renderedRef.current = true;
      },
      () => undefined,
    );
    return () => {
      if (!renderedRef.current) task.cancel();
    };
  }, [active, page, width]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.thumbCanvas}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.6 10.6 14 14M4.75 7h4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.6 10.6 14 14M4.75 7h4.5M7 4.75v4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FitWidthIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M1.5 3.5v9M14.5 3.5v9M4 8h8M4 8l2-2M4 8l2 2M12 8l-2-2M12 8l-2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FitPageIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect
        x="4.25"
        y="2.25"
        width="7.5"
        height="11.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
