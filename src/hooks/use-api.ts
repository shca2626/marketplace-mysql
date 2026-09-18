'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useApi<T>(url: string | null, opts?: { skip?: boolean }) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url && !opts?.skip)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef(url)
  urlRef.current = url

  const fetchData = useCallback(async () => {
    const u = urlRef.current
    if (!u) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(u, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`)
        setData(null)
      } else {
        setData(json as T)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!url || opts?.skip) return
    void fetchData()
  }, [url, opts?.skip, fetchData])

  return { data, loading, error, refetch: fetchData, setData }
}
