'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useApi<T>(
  url: string | null,
  opts?: { skip?: boolean; pollMs?: number; pollWhenHidden?: boolean }
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url && !opts?.skip)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef(url)
  urlRef.current = url

  const fetchData = useCallback(async (fetchOpts?: { silent?: boolean }) => {
    const u = urlRef.current
    if (!u) return
    if (!fetchOpts?.silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch(u, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`)
        // Background polls keep the last good data on transient failures
        if (!fetchOpts?.silent) setData(null)
      } else {
        setData(json as T)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      if (!fetchOpts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!url || opts?.skip) return
    void fetchData()
    if (opts?.pollMs && opts.pollMs > 0) {
      const timer = setInterval(() => {
        // Skip background tabs unless explicitly requested — visibility handles
        // the common "leave the tab open" case without wasted polling.
        if (opts.pollWhenHidden || typeof document === 'undefined' || document.visibilityState === 'visible') {
          void fetchData({ silent: true })
        }
      }, opts.pollMs)
      return () => clearInterval(timer)
    }
  }, [url, opts?.skip, opts?.pollMs, opts?.pollWhenHidden, fetchData])

  return { data, loading, error, refetch: fetchData, setData }
}
