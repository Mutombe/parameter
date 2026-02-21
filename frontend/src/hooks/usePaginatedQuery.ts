import { useState, useCallback, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

const DEFAULT_PAGE_SIZE = 25

interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

interface UsePaginatedQueryOptions<T> {
  queryKey: unknown[]
  queryFn: (params: { page: number; page_size: number }) => Promise<PaginatedResponse<T>>
  pageSize?: number
  enabled?: boolean
}

interface UsePaginatedQueryResult<T> {
  items: T[]
  isLoading: boolean
  isFetching: boolean
  totalCount: number
  totalPages: number
  currentPage: number
  pageSize: number
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  hasNextPage: boolean
  hasPreviousPage: boolean
  refetch: () => void
}

export function usePaginatedQuery<T = any>({
  queryKey,
  queryFn,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  enabled = true,
}: UsePaginatedQueryOptions<T>): UsePaginatedQueryResult<T> {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialPageSize)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [...queryKey, currentPage, pageSize],
    queryFn: () => queryFn({ page: currentPage, page_size: pageSize }),
    placeholderData: keepPreviousData,
    enabled,
  })

  const totalCount = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const items = data?.results ?? []

  // Auto-correct page if it exceeds totalPages (e.g. after filtering reduces results)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0 && !isFetching) {
      setCurrentPage(totalPages)
    }
  }, [totalPages, currentPage, isFetching])

  const setPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, page))
  }, [])

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size)
    setCurrentPage(1)
  }, [])

  return {
    items,
    isLoading,
    isFetching,
    totalCount,
    totalPages,
    currentPage,
    pageSize,
    setPage,
    setPageSize,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    refetch,
  }
}
