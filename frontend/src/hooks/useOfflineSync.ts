import { useState, useEffect, useCallback } from 'react'

interface QueuedMutation {
  id: string
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: any
  timestamp: number
}

const DB_NAME = 'parameter-offline'
const STORE_NAME = 'mutation-queue'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function addToQueue(mutation: QueuedMutation): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(mutation)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getQueue(): Promise<QueuedMutation[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queueLength, setQueueLength] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Check queue length on mount and when online status changes
  useEffect(() => {
    getQueue().then(q => setQueueLength(q.length)).catch(() => {})
  }, [isOnline])

  // Replay queue when coming back online
  useEffect(() => {
    if (isOnline) {
      replayQueue()
    }
  }, [isOnline])

  const queueMutation = useCallback(async (
    url: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    data?: any
  ) => {
    const mutation: QueuedMutation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url,
      method,
      data,
      timestamp: Date.now(),
    }

    await addToQueue(mutation)
    setQueueLength(prev => prev + 1)
  }, [])

  const replayQueue = useCallback(async () => {
    if (isSyncing) return

    const queue = await getQueue()
    if (queue.length === 0) return

    setIsSyncing(true)

    const { default: api } = await import('../services/api')

    for (const mutation of queue) {
      try {
        await api.request({
          url: mutation.url,
          method: mutation.method,
          data: mutation.data,
        })
        await removeFromQueue(mutation.id)
        setQueueLength(prev => Math.max(0, prev - 1))
      } catch (error) {
        // If it fails again, leave in queue
        console.error('Failed to replay mutation:', mutation.id, error)
        break
      }
    }

    setIsSyncing(false)
  }, [isSyncing])

  return {
    isOnline,
    queueLength,
    isSyncing,
    queueMutation,
    replayQueue,
  }
}
