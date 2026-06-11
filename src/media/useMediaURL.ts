import { useEffect, useState } from 'react'
import { getMediaURL } from './store'

/** Resolve a local_uri (opfs:/idb:) to an object URL, revoking it on unmount/change. */
export function useMediaURL(local_uri?: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let current: string | null = null
    if (!local_uri) {
      setUrl(null)
      return
    }
    getMediaURL(local_uri).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      current = u
      setUrl(u)
    })
    return () => {
      cancelled = true
      if (current) URL.revokeObjectURL(current)
    }
  }, [local_uri])
  return url
}
