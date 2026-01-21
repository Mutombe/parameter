import { useMutation, useQueryClient, QueryKey } from '@tanstack/react-query'
import { showToast, parseApiError } from '../lib/toast'

interface OptimisticMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<{ data: TData }>
  queryKey: QueryKey
  // For create operations - adds a placeholder item
  createPlaceholder?: (variables: TVariables) => Partial<TData> & { id: string | number }
  // For update operations - transforms existing item
  updateItem?: (variables: TVariables, oldData: TData[]) => TData[]
  // For delete operations - removes item by id
  deleteId?: (variables: TVariables) => string | number
  // Success/error messages
  successMessage?: string
  errorMessage?: string
  // Callback after mutation succeeds (before invalidation completes)
  onSuccess?: (data: TData, variables: TVariables) => void
  // Callback when mutation fails
  onError?: (error: unknown, variables: TVariables) => void
  // Whether to close modal immediately (optimistic)
  closeModal?: () => void
}

export function useOptimisticMutation<TData extends { id: string | number }, TVariables>({
  mutationFn,
  queryKey,
  createPlaceholder,
  updateItem,
  deleteId,
  successMessage,
  errorMessage,
  onSuccess,
  onError,
  closeModal,
}: OptimisticMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      // Close modal immediately for optimistic UX
      closeModal?.()

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot current data
      const previousData = queryClient.getQueryData<{ results?: TData[]; data?: TData[] } | TData[]>(queryKey)

      // Optimistically update
      if (previousData) {
        queryClient.setQueryData(queryKey, (old: any) => {
          // Handle paginated response
          const items = old?.results || old?.data || old || []
          let newItems: TData[]

          if (createPlaceholder) {
            // Create: add placeholder with loading state
            const placeholder = {
              ...createPlaceholder(variables),
              _isOptimistic: true,
              _isLoading: true,
            } as unknown as TData
            newItems = [placeholder, ...items]
          } else if (updateItem) {
            // Update: transform items
            newItems = updateItem(variables, items)
          } else if (deleteId) {
            // Delete: filter out item
            const idToDelete = deleteId(variables)
            newItems = items.filter((item: TData) => item.id !== idToDelete)
          } else {
            return old
          }

          // Preserve pagination structure
          if (old?.results) {
            return { ...old, results: newItems }
          } else if (old?.data) {
            return { ...old, data: newItems }
          }
          return newItems
        })
      }

      return { previousData }
    },
    onSuccess: (response, variables) => {
      // Show success toast
      if (successMessage) {
        showToast.success(successMessage)
      }

      // Call custom success handler
      onSuccess?.(response.data, variables)

      // Invalidate to get fresh data from server
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }

      // Show error toast with user-friendly message
      const message = parseApiError(error, errorMessage || 'Operation failed')
      showToast.error(message)

      // Call custom error handler
      onError?.(error, variables)
    },
  })
}

// Hook for optimistic create with loading skeleton
export function useOptimisticCreate<TData extends { id: string | number }, TVariables>({
  mutationFn,
  queryKey,
  createPlaceholder,
  successMessage = 'Created successfully',
  errorMessage = 'Failed to create',
  closeModal,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<{ data: TData }>
  queryKey: QueryKey
  createPlaceholder: (variables: TVariables) => Partial<TData> & { id: string | number }
  successMessage?: string
  errorMessage?: string
  closeModal?: () => void
  onSuccess?: (data: TData, variables: TVariables) => void
}) {
  return useOptimisticMutation({
    mutationFn,
    queryKey,
    createPlaceholder,
    successMessage,
    errorMessage,
    closeModal,
    onSuccess,
  })
}

// Hook for optimistic update
export function useOptimisticUpdate<TData extends { id: string | number }, TVariables extends { id: string | number }>({
  mutationFn,
  queryKey,
  successMessage = 'Updated successfully',
  errorMessage = 'Failed to update',
  closeModal,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<{ data: TData }>
  queryKey: QueryKey
  successMessage?: string
  errorMessage?: string
  closeModal?: () => void
  onSuccess?: (data: TData, variables: TVariables) => void
}) {
  return useOptimisticMutation({
    mutationFn,
    queryKey,
    updateItem: (variables, oldData) =>
      oldData.map((item) =>
        item.id === variables.id
          ? { ...item, ...variables, _isOptimistic: true, _isLoading: true }
          : item
      ) as TData[],
    successMessage,
    errorMessage,
    closeModal,
    onSuccess,
  })
}

// Hook for optimistic delete
export function useOptimisticDelete<TData extends { id: string | number }>({
  mutationFn,
  queryKey,
  successMessage = 'Deleted successfully',
  errorMessage = 'Failed to delete',
  onSuccess,
}: {
  mutationFn: (id: number) => Promise<any>
  queryKey: QueryKey
  successMessage?: string
  errorMessage?: string
  onSuccess?: () => void
}) {
  return useOptimisticMutation<TData, number>({
    mutationFn: (id) => mutationFn(id),
    queryKey,
    deleteId: (id) => id,
    successMessage,
    errorMessage,
    onSuccess: onSuccess ? () => onSuccess() : undefined,
  })
}
