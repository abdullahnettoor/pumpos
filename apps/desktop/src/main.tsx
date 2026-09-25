import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import {
  QueryProvider,
  createQueryClient,
  ErrorBoundary,
  setPdfSaver,
  setPdfPrinter,
  ConfirmProvider,
  ToastProvider,
} from '@pump/ui';
import '@pump/ui/src/index.css';
import '@pump/ui/src/pump-ds/tailwind.css';
import { installDesktopTitleBar } from './titleBar.js';

// Desktop: WKWebView (mac) / WebView2 (win) block browser file downloads, so
// route generated PDF bytes through Tauri's native save dialog + filesystem.
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  // The app's own top bar doubles as the window title bar; register the
  // platform's window-control geometry and commands (#117).
  void installDesktopTitleBar();

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

  // Print (#309): the webview cannot print a PDF, so write the same bytes Save
  // PDF would to a temp file and open it in the system PDF viewer, whose Print
  // command then prints it page for page.
  setPdfPrinter(async (bytes, filename) => {
    const [{ tempDir, join }, { mkdir, writeFile }, { openPath }] = await Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-fs'),
      import('@tauri-apps/plugin-opener'),
    ]);
    const dir = await join(await tempDir(), 'pumpos-print');
    await mkdir(dir, { recursive: true });
    const path = await join(dir, filename);
    await writeFile(path, bytes);
    await openPath(path);
  });
}

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </QueryProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
