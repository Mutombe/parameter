import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 min: cached data shown instantly, no refetch
      gcTime: 60 * 60 * 1000,  // 60 min: cache kept for 1 hour
      retry: 1,
      refetchOnWindowFocus: false, // No flash on tab-back
      // Refetch on mount only when the cache is older than staleTime.
      // 'always' re-hit every endpoint on every page visit, so navigating
      // felt slow even with fresh data; mutations invalidate their own
      // keys, so a ≤10-min-old cache is safe to serve untouched.
      refetchOnMount: true,
      refetchOnReconnect: false,
      structuralSharing: true,
    },
    mutations: {
      retry: 0, // Don't retry mutations
    },
  },
})

// Export for use in login prefetch and other non-component contexts
export { queryClient }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
