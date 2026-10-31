import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { MessageList, MessageSummary } from "@/lib/types"

/**
 * Loads the message list and keeps it live: the server pushes events over SSE
 * (`/api/events`) and we simply refetch when anything changes.
 */
export function useMailbox(query: string) {
  const [data, setData] = useState<MessageList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const queryRef = useRef(query)

  useEffect(() => {
    queryRef.current = query
  }, [query])

  const refresh = useCallback(async () => {
    try {
      setData(await api.list(queryRef.current))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [query, refresh])

  useEffect(() => {
    const source = new EventSource("/api/events")
    source.onopen = () => {
      setConnected(true)
      void refresh() // catch up on anything missed while disconnected
    }
    source.onerror = () => setConnected(false)
    source.addEventListener("message-added", (ev) => {
      try {
        const m = JSON.parse((ev as MessageEvent<string>).data) as MessageSummary
        toast(m.subject || "(no subject)", { description: `From ${m.from}` })
      } catch {
        /* ignore malformed payloads */
      }
      void refresh()
    })
    for (const name of ["message-updated", "message-deleted", "cleared"]) {
      source.addEventListener(name, () => void refresh())
    }
    return () => source.close()
  }, [refresh])

  return { data, error, connected, refresh }
}
