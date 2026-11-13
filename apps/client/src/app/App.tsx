import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiClientError } from '@/lib/api';
import { routes } from './routes';
import { UpdatePrompt } from './UpdatePrompt';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors (4xx) won't succeed on retry; network blips and 5xx might.
      retry: (failureCount, error) =>
        !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
  },
});

const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <UpdatePrompt />
    </QueryClientProvider>
  );
}
