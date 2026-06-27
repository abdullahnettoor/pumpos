import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Shared QueryClient factory. App shells (web, desktop) create one client and
 * wrap their tree in {@link QueryProvider}; all data hooks in @pump/ui read from
 * this single cache. Defaults favour operator workflows: short stale time,
 * refetch on focus (a shift screen left open should catch new transactions),
 * and a single retry (the API is on a low-latency edge).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export interface QueryProviderProps {
  client?: QueryClient;
  children: React.ReactNode;
}

let fallbackClient: QueryClient | null = null;

export const QueryProvider: React.FC<QueryProviderProps> = ({ client, children }) => {
  if (!client && !fallbackClient) {
    fallbackClient = createQueryClient();
  }
  return <QueryClientProvider client={client ?? fallbackClient!}>{children}</QueryClientProvider>;
};
