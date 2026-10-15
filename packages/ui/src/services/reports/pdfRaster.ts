/// <reference types="vite/client" />
// pdf.js draws a PDF's pages to images for the on-screen previews (#605): the
// report template preview and the letterhead preview show the exact bytes the
// PDF export saves, not a hand-drawn likeness. It is loaded on demand, with
// the PDF engine, only where a preview is open.
//
// The legacy build carries its own polyfills, for the older WebKit a desktop
// (Tauri) install may run on. Eval stays off (the desktop CSP has no
// 'unsafe-eval'), and the worker is served from the app itself ('self').
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/** One drawn page: a PNG data URL (the desktop CSP allows `data:` images) and its pixel size. */
export interface PdfPageImage {
  src: string;
  width: number;
  height: number;
}

export interface RasterOptions {
  /** CSS width the page is shown at; it is drawn at twice that for sharp text. */
  width: number;
  /** Draw at most this many pages (a card thumbnail needs one). */
  maxPages?: number;
}

/** Draw the pages of a PDF as images. */
export async function rasterizePdf(
  bytes: Uint8Array,
  { width, maxPages = Infinity }: RasterOptions,
): Promise<PdfPageImage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // pdf.js takes ownership of the buffer it is given; hand it a copy.
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const pages: PdfPageImage[] = [];
    const count = Math.min(doc.numPages, maxPages);
    for (let n = 1; n <= count; n += 1) {
      const page = await doc.getPage(n);
      const scale = (width * 2) / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      pages.push({
        src: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      });
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
