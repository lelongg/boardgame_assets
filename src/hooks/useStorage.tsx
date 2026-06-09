import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import { createStorage, type StorageBackend } from '../storage'

// ── Shared storage singleton ────────────────────────────────────────
// Resolved once, shared across all hooks via module scope.
// This avoids re-initializing per hook instance.
let resolvedStorage: StorageBackend | null = null
let storagePromise: Promise<StorageBackend> | null = null

function getStoragePromise() {
  if (!storagePromise) {
    storagePromise = createStorage().then(s => {
      resolvedStorage = s
      return s
    })
    // Allow a later mount to retry instead of caching the failure forever.
    storagePromise.catch(() => { storagePromise = null })
  }
  return storagePromise
}

// ── Context for per-page status/error ───────────────────────────────
const StorageInstanceContext = createContext<StorageBackend | null>(null)

export function StorageProvider({ children }: { children: ReactNode }) {
  const [storage, setStorage] = useState<StorageBackend | null>(resolvedStorage)

  useEffect(() => {
    if (resolvedStorage) { setStorage(resolvedStorage); return }
    let cancelled = false
    getStoragePromise()
      .then(s => { if (!cancelled) setStorage(s) })
      .catch(err => { console.error('Storage initialization failed:', err) })
    return () => { cancelled = true }
  }, [])

  return (
    <StorageInstanceContext.Provider value={storage}>
      {children}
    </StorageInstanceContext.Provider>
  )
}

/** Returns the shared storage instance (null while initializing). */
export function useStorageInstance(): StorageBackend | null {
  return useContext(StorageInstanceContext)
}

// ── Per-page hook (status, error) ───────────────────────────────────
export default function useStorage() {
  const storage = useStorageInstance()
  const [status, setStatus] = useState(storage ? 'Ready.' : 'Loading...')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)

  const setError = useCallback((message: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error)
    setStatus(message)
    setErrorDetail(detail)
  }, [])

  const clearError = useCallback(() => setErrorDetail(null), [])

  useEffect(() => {
    if (storage) {
      setIsAuthorized(storage.isAuthorized())
      setStatus('Ready.')
    }
  }, [storage])

  return { storage, loading: !storage, status, setStatus, setError, errorDetail, clearError, isAuthorized, setIsAuthorized }
}
