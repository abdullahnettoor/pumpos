import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { QueryProvider, createQueryClient, ErrorBoundary, ConfirmProvider } from '@pump/ui';
import '@pump/ui/src/index.css';

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
