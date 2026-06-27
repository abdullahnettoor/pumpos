import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { QueryProvider, createQueryClient } from '@pump/ui';
import '@pump/ui/src/index.css';

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider client={queryClient}>
      <App />
    </QueryProvider>
  </React.StrictMode>,
);
