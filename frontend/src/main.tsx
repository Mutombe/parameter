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
      staleTime: 10 * 60 * 1000, // 10 minutes — data stays fresh, no refetch
      gcTime: 60 * 60 * 1000, // 60 minutes — keep cache for 1 hour
      retry: 1,
      refetchOnWindowFocus: false, // No loading flash on tab-back
      refetchOnMount: false, // NEVER refetch if cached — use what login prefetched
      refetchOnReconnect: false, // Don't refetch on reconnect either
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
