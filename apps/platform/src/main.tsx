import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary, ToastProvider } from '@pump/ui';
import App from './App.js';
import '@pump/ui/src/index.css';
import '@pump/ui/src/pump-ds/tailwind.css';

/**
 * A plain client, not `@pump/ui`'s `createQueryClient`: that one persists the
 * tenant app's reference data to storage, and platform state must never
 * outlive the session that changed it.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, gcTime: 5 * 60_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
