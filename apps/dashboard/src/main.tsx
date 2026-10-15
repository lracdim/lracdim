import { render } from 'solid-js/web';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { RouterProvider } from '@tanstack/solid-router';
import { router } from './router';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Per-resource staleTime lives in src/api/hooks/queryKeys.ts.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('No #root element in index.html.');

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  ),
  root,
);
