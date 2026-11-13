import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { refreshSession } from '@/features/auth/session';
import { queryClient } from '@/lib/query-client';
import { routes } from './routes';
import { UpdatePrompt } from './UpdatePrompt';

const router = createBrowserRouter(routes);

export function App() {
  // Restore the session from the refresh cookie (web) or secure storage (Android).
  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <UpdatePrompt />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
