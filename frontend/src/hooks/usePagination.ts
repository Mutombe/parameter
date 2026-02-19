import { useState, useMemo } from 'react'

interface UsePaginationOptions {
  pageSize?: number
}

export function usePagination<T>(data: T[], options?: UsePaginationOptions) {
  const pageSize = options?.pageSize || 10
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.ceil(data.length / pageSize)

  // Reset to page 1 when data changes significantly
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, currentPage, pageSize])

  // Reset page when filtered data changes
  useMemo(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [data.length])

  return {
    paginatedData,
    currentPage,
    totalPages,
    setCurrentPage,
    pageSize,
    totalItems: data.length,
    startIndex: (currentPage - 1) * pageSize + 1,
    endIndex: Math.min(currentPage * pageSize, data.length),
  }
}
