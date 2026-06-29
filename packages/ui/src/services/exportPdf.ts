// Cross-platform "Save as PDF" that reuses the already-rendered report DOM
// (the `.print-area` card) instead of re-authoring a PDF layout. Works in web
// browsers AND the Tauri webview (incl. macOS WKWebView, where window.print()
// is a no-op and anchor downloads are blocked), because the bytes are routed
// through a pluggable saver: the web default triggers a browser download; the
// desktop app injects a Tauri save-dialog + filesystem writer via setPdfSaver().
//
// Tradeoff: output is image-based (text is slightly softer than native vector
// print). For crisp vector output on the web, window.print() is still wired.

export type PdfSaver = (bytes: Uint8Array, filename: string) => Promise<void>;

const webSaver: PdfSaver = async (bytes, filename) => {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

let saver: PdfSaver = webSaver;

/** Desktop (Tauri) registers a native save-dialog + fs writer here at startup. */
export function setPdfSaver(fn: PdfSaver) {
  saver = fn;
}

export async function exportReportPdf(target: HTMLElement | null, filename: string): Promise<void> {
  if (!target) return;
  const name = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  // html2pdf.js touches `window`/`document`, so import it lazily at click time.
  const mod = await import('html2pdf.js');
  const html2pdf = (mod as any).default ?? (mod as any);
  const blob: Blob = await html2pdf()
    .set({
      margin: 8,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    })
    .from(target)
    .outputPdf('blob');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await saver(bytes, name);
}
