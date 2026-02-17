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
      staleTime: 2 * 60 * 1000, // Data is fresh for 2 minutes (was 5 — too stale for multi-user)
      gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes (was 30)
      retry: 1,
      refetchOnWindowFocus: true, // Refetch when window regains focus for fresh data
      refetchOnMount: 'always', // Always check freshness on mount
    },
    mutations: {
      retry: 0, // Don't retry mutations
    },
  },
})

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
