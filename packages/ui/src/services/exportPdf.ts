// Report PDFs are built once, as vector PDFs with @react-pdf/renderer, and then
// either saved or printed. Save PDF and Print use the same bytes, so a printed
// Shift Summary or DSSR is page-for-page the saved PDF (#309).
//
// Both routes are pluggable because platforms differ: the web default saves via
// a browser download and prints via a hidden iframe; the desktop app (Tauri,
// where downloads are blocked and window.print() is a no-op) injects a native
// save dialog (setPdfSaver) and a system-viewer printer (setPdfPrinter).

export type PdfSaver = (bytes: Uint8Array, filename: string) => Promise<void>;
export type PdfPrinter = (bytes: Uint8Array, filename: string) => Promise<void>;

const pdfBlob = (bytes: Uint8Array) =>
  new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });

const webSaver: PdfSaver = async (bytes, filename) => {
  const url = URL.createObjectURL(pdfBlob(bytes));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Safari prints a PDF in an iframe unreliably (blank page or the host page), so
 * it gets the PDF in a new tab and prints from its viewer instead.
 */
export function prefersNewTabPrint(userAgent: string): boolean {
  return /Safari\//.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR|Android)\//.test(userAgent);
}

/** How long the blob URL outlives the print dialog opening. */
const REVOKE_AFTER_MS = 60_000;

const webPrinter: PdfPrinter = async (bytes) => {
  const url = URL.createObjectURL(pdfBlob(bytes));
  const revoke = () => URL.revokeObjectURL(url);

  if (prefersNewTabPrint(navigator.userAgent)) {
    window.open(url, '_blank');
    setTimeout(revoke, REVOKE_AFTER_MS);
    return;
  }

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  const cleanup = () => {
    frame.remove();
    revoke();
  };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // A browser that refuses to print the frame still gets the PDF.
      window.open(url, '_blank');
    }
    // print() may return before the dialog closes; keep the frame alive long
    // enough for it, then clean up.
    setTimeout(cleanup, REVOKE_AFTER_MS);
  };
  frame.src = url;
  document.body.appendChild(frame);
};

let saver: PdfSaver = webSaver;
let printer: PdfPrinter = webPrinter;

/** Desktop (Tauri) registers a native save-dialog + fs writer here at startup. */
export function setPdfSaver(fn: PdfSaver) {
  saver = fn;
}

/** Desktop (Tauri) registers a printer (temp file + system viewer) at startup. */
export function setPdfPrinter(fn: PdfPrinter) {
  printer = fn;
}

const pdfName = (filename: string) => (filename.endsWith('.pdf') ? filename : `${filename}.pdf`);

/** Render a @react-pdf/renderer document element to PDF bytes. */
async function renderPdf(element: any): Promise<Uint8Array> {
  const { pdf } = await import('@react-pdf/renderer');
  const blob: Blob = await pdf(element).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

/** Save a vector PDF built from a @react-pdf/renderer document element. */
export async function exportReactPdf(element: any, filename: string): Promise<void> {
  await saver(await renderPdf(element), pdfName(filename));
}

/** Print the same vector PDF that `exportReactPdf` saves (#309). */
export async function printReactPdf(element: any, filename: string): Promise<void> {
  await printer(await renderPdf(element), pdfName(filename));
}

export type PdfOutput = 'save' | 'print';

/** Save or print one PDF element; report generators take this as a mode. */
export function outputReactPdf(element: any, filename: string, output: PdfOutput = 'save') {
  return output === 'print' ? printReactPdf(element, filename) : exportReactPdf(element, filename);
}
