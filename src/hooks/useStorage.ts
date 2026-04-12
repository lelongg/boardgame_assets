import { useState, useEffect, useCallback } from 'react'
import { createStorage } from '../storage'

export default function useStorage() {
  const [storage, setStorage] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('Loading...')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)

  const setError = useCallback((message: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error)
    setStatus(message)
    setErrorDetail(detail)
  }, [])

  const clearError = useCallback(() => setErrorDetail(null), [])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const s = await createStorage()
        if (cancelled) return
        setStorage(s)
        setIsAuthorized(s.isAuthorized())
        setStatus('Ready.')
      } catch (error) {
        if (cancelled) return
        setError('Storage initialization failed', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  return { storage, loading, status, setStatus, setError, errorDetail, clearError, isAuthorized, setIsAuthorized }
}
