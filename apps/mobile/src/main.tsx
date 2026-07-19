import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryProvider, createQueryClient, ErrorBoundary, ToastProvider, setPdfSaver } from '@pump/ui';
import '@pump/ui/src/index.css';
import '@pump/ui/src/pump-ds/tailwind.css';
import './mobile.css';
import { App } from './App.js';

const queryClient = createQueryClient();

// On phones, route generated PDFs to the native share sheet (Web Share API with
// files) so owners can save/forward via WhatsApp, email, Drive, etc. Falls back
// to a plain download when file-sharing isn't available.
setPdfSaver(async (bytes, filename) => {
  const file = new File([bytes as unknown as BlobPart], filename, { type: 'application/pdf' });
  const nav: any = navigator;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch {
      /* user cancelled or share failed → fall through to download */
    }
  }
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Register the service worker for installability + offline app shell.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW registration is best-effort; app works without it */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryProvider client={queryClient}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
