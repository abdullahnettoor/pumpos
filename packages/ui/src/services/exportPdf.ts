// Cross-platform "Save as PDF" that reuses the already-rendered report DOM
// (the `.print-area` card) instead of re-authoring a PDF layout. Works in web
// browsers AND the Tauri webview (incl. macOS WKWebView, where window.print()
// is a no-op), because html2pdf rasterizes the node and downloads a file
// directly without the native print dialog.
//
// Tradeoff: output is image-based (text is slightly softer than native vector
// print). For crisp vector output on the web, window.print() is still wired.
export async function exportReportPdf(target: HTMLElement | null, filename: string): Promise<void> {
  if (!target) return;
  // html2pdf.js touches `window`/`document`, so import it lazily at click time.
  const mod = await import('html2pdf.js');
  const html2pdf = (mod as any).default ?? (mod as any);
  await html2pdf()
    .set({
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      margin: 8,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    })
    .from(target)
    .save();
}
