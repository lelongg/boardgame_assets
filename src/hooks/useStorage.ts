import { useState, useEffect } from 'react'
import { createStorage } from '../storage'

export default function useStorage() {
  const [storage, setStorage] = useState<any>(null)
  const [status, setStatus] = useState('Loading...')
  const [isAuthorized, setIsAuthorized] = useState(false)

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
        setStatus('Error initializing storage.')
        console.error('Storage initialization failed:', error)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  return { storage, status, setStatus, isAuthorized, setIsAuthorized }
}
