import { useState, useEffect, useRef } from 'react'
import { getAsset } from '../storage/assetCache'

const ASSET_PATTERN = /^\/api\/games\/[^/]+\/(fonts|images)\/[^/]+$/

/** Resolves `/api/games/.../images/...` paths to blob URLs via the IndexedDB asset cache.
 *  Returns the original src for non-asset URLs or when no cached entry exists. */
export default function useAssetUrl(src: string | undefined): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() =>
    src && ASSET_PATTERN.test(src) ? undefined : src
  )
  const [prevSrc, setPrevSrc] = useState(src)
  const blobUrlRef = useRef<string | undefined>(undefined)

  if (src !== prevSrc) {
    setPrevSrc(src)
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = undefined }
    setResolved(src && ASSET_PATTERN.test(src) ? undefined : src)
  }

  useEffect(() => {
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current) }
  }, [])

  useEffect(() => {
    if (!src || !ASSET_PATTERN.test(src)) return
    let cancelled = false
    getAsset(src)
      .then(entry => {
        if (cancelled) return
        if (entry) {
          const url = URL.createObjectURL(entry.blob)
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = url
          setResolved(url)
        } else {
          setResolved(src)
        }
      })
      .catch(() => { if (!cancelled) setResolved(src) })
    return () => { cancelled = true }
  }, [src])

  return resolved
}
