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
      staleTime: 5 * 60 * 1000, // 5 minutes — data fresh for 5min, no refetch during this window
      gcTime: 30 * 60 * 1000, // 30 minutes — keep cache for reuse
      retry: 1,
      refetchOnWindowFocus: false, // Don't refetch on tab-back (causes loading flashes)
      refetchOnMount: true, // Show cached data, only refetch if stale (after 5 min)
      refetchOnReconnect: true,
      structuralSharing: true, // Smooth transitions between data updates
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
