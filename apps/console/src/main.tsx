import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import {
  QueryProvider,
  createQueryClient,
  ErrorBoundary,
  ConfirmProvider,
  ToastProvider,
  ThemeProvider,
} from '@pump/ui';
import '@pump/ui/src/index.css';
import '@pump/ui/src/pump-ds/tailwind.css';

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryProvider client={queryClient}>
          <ToastProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </ToastProvider>
        </QueryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
