import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryProvider, createQueryClient, ErrorBoundary, ToastProvider } from '@pump/ui';
import '@pump/ui/src/index.css';
import '@pump/ui/src/pump-ds/tailwind.css';
import './mobile.css';
import { App } from './App.js';

const queryClient = createQueryClient();

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
