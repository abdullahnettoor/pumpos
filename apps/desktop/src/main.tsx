import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { QueryProvider, createQueryClient, ErrorBoundary, setPdfSaver, ConfirmProvider } from '@pump/ui';
import '@pump/ui/src/index.css';

// Desktop: WKWebView (mac) / WebView2 (win) block browser file downloads, so
// route generated PDF bytes through Tauri's native save dialog + filesystem.
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  setPdfSaver(async (bytes, filename) => {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (path) await writeFile(path, bytes);
  });
}

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryProvider client={queryClient}>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </QueryProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
