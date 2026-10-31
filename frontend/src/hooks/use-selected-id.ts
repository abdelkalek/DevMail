import { useCallback, useEffect, useState } from "react"

/** The selected message lives in the URL hash (`#/m/<id>`), so it survives reloads and is linkable. */
function readHash(): string | null {
  const m = window.location.hash.match(/^#\/m\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export function useSelectedId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(readHash)

  useEffect(() => {
    const onChange = () => setId(readHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  const select = useCallback((next: string | null) => {
    if (next) {
      window.location.hash = `/m/${encodeURIComponent(next)}`
    } else {
      history.pushState(null, "", window.location.pathname + window.location.search)
      setId(null)
    }
  }, [])

  return [id, select]
}
