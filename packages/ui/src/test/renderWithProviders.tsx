import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { ToastProvider } from '../components/primitives/ToastProvider.js';
import { ConfirmProvider } from '../components/primitives/ConfirmDialog.js';

/**
 * Shared render helper for `*.dom.test.tsx`.
 *
 * Several screens pull in providers that **throw** rather than degrade —
 * `useToast`, `useConfirm` and `useRunTask` (which calls `useToast`) all fail
 * loudly outside their provider. Wiring them per test file meant every new test
 * rediscovering which ones a component happens to need.
 *
 * Note vitest here runs without globals and without a setup file, so RTL's
 * automatic cleanup never registers: test files must still call `cleanup()`
 * themselves in `afterEach`.
 */
export interface ProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Supply a pre-seeded client to stub query data without touching the network. */
  queryClient?: QueryClient;
}

/**
 * Retries and background refetching make assertions non-deterministic, and a
 * retrying query turns a deliberate error fixture into a timeout.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
    // Swallow the expected console noise from deliberate error fixtures.
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  } as never);
}

export function renderWithProviders(
  ui: React.ReactElement,
  { queryClient, ...options }: ProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const client = queryClient ?? createTestQueryClient();
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient: client };
}

/** Seed a query key so a component's hook resolves synchronously on first render. */
export function seedQuery(client: QueryClient, key: readonly unknown[], data: unknown) {
  client.setQueryData(key, data);
}
