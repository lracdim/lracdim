import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import '@fontsource-variable/dm-sans'
import './styles.css'
import { ApiError } from './lib/api'
import { router } from './router'
import { session } from './lib/session'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (n, err) => !(err instanceof ApiError && [401, 403, 404, 422].includes(err.status)) && n < 2,
    },
  },
})

// When a session ends (sign-out or expired token) send the user to the sign-in screen.
session.subscribe(() => {
  if (!session.get() && !location.pathname.startsWith('/login')) router.navigate({ to: '/login' })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
