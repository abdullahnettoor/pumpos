// PROTOTYPE — throwaway (#476). Standalone entry: no login, no API.
// Renders the Decantations page inside a minimal nav stack.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryProvider, createQueryClient, ToastProvider } from '@pump/ui';
import '@pump/ui/src/index.css';
import '../../theme/tailwind.css';
import '../../theme/tokens.css';
import '../../mobile.css';
import { ThemeProvider } from '../../theme/index.js';
import { NavProvider, useNav } from '../../shell/nav.js';
import { DecantationsPrototypePage } from './DecantationsPrototypePage.js';

const Stack: React.FC = () => {
  const nav = useNav();
  const stack = nav.stacks[nav.active] ?? [];
  const top = stack[stack.length - 1];
  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-background">
      <div hidden={!!top}>
        <DecantationsPrototypePage />
      </div>
      {top && <div key={top.id}>{top.element}</div>}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryProvider client={createQueryClient()}>
    <ThemeProvider>
      <ToastProvider>
        <NavProvider tabs={['home']}>
          <Stack />
        </NavProvider>
      </ToastProvider>
    </ThemeProvider>
  </QueryProvider>,
);
