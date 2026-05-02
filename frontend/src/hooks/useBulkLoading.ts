import { useState, useCallback } from 'react'

/**
 * Tracks which bulk action is currently in flight.
 *
 * Use across pages with a BulkActionsBar so each action button can show its
 * own spinner during a slow operation (delete, post, send, activate). The
 * single-string state means peers can be disabled while one is running,
 * preventing double-clicks across actions.
 *
 * Usage:
 *   const bulk = useBulkLoading()
 *   bulk.run('delete', async () => { await ... })
 *   <BulkActionsBar actions={[
 *     { label: 'Delete', onClick: ..., loading: bulk.is('delete'), disabled: bulk.busy && !bulk.is('delete') }
 *   ]} />
 */
export function useBulkLoading() {
  const [active, setActive] = useState<string | null>(null)

  const run = useCallback(async (key: string, fn: () => Promise<void> | void) => {
    setActive(key)
    try {
      await fn()
    } finally {
      setActive(null)
    }
  }, [])

  return {
    /** Key of the action currently running, or null. */
    active,
    /** True while any bulk action is running. */
    busy: active !== null,
    /** Whether the named action is the one currently running. */
    is: (key: string) => active === key,
    /** Wrap an async bulk handler. */
    run,
  }
}
