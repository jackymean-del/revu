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
// After a new version is deployed, a tab opened before it may ask for a
// screen file that no longer exists. Load the new version once instead;
// a second failure on the same page is left to the screen's error message.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('revu-reloaded') === location.pathname) return
    sessionStorage.setItem('revu-reloaded', location.pathname)
  } catch {
    return // storage blocked: show the error rather than risk a loop
  }
  e.preventDefault()
  location.reload()
})

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
