import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from './lib/AuthProvider'
import { OrgProvider } from './lib/OrgProvider'
import { TermsProvider } from './lib/terminology/TermsProvider'
import { router } from './router'
import './index.css'

// Data a screen just read is shown at once when it is opened again, and
// refreshed in the background after 20 seconds.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <OrgProvider>
          <TermsProvider>
            <RouterProvider router={router} />
          </TermsProvider>
        </OrgProvider>
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
)
