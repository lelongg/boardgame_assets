import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import { createStorage } from '../storage'

// ── Shared storage singleton ────────────────────────────────────────
// Resolved once, shared across all hooks via module scope.
// This avoids re-initializing per hook instance.
let resolvedStorage: any = null
let storagePromise: Promise<any> | null = null

function getStoragePromise() {
  if (!storagePromise) {
    storagePromise = createStorage().then(s => {
      resolvedStorage = s
      return s
    })
  }
  return storagePromise
}

// ── Context for per-page status/error ───────────────────────────────
const StorageInstanceContext = createContext<any>(null)

export function StorageProvider({ children }: { children: ReactNode }) {
  const [storage, setStorage] = useState<any>(resolvedStorage)

  useEffect(() => {
    if (resolvedStorage) { setStorage(resolvedStorage); return }
    let cancelled = false
    getStoragePromise().then(s => { if (!cancelled) setStorage(s) })
    return () => { cancelled = true }
  }, [])

  return (
    <StorageInstanceContext.Provider value={storage}>
      {children}
    </StorageInstanceContext.Provider>
  )
}

/** Returns the shared storage instance (null while initializing). */
export function useStorageInstance() {
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
