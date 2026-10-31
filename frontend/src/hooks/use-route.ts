import { useCallback, useEffect, useState } from "react"

export type Route =
  | { page: "dashboard" }
  | { page: "inbox" }
  | { page: "message"; id: string }

/** The current page lives in the URL hash (`#/inbox`, `#/m/<id>`), so it survives reloads and is linkable. */
function readHash(): Route {
  const hash = window.location.hash
  const m = hash.match(/^#\/m\/(.+)$/)
  if (m) return { page: "message", id: decodeURIComponent(m[1]) }
  if (hash === "#/inbox") return { page: "inbox" }
  return { page: "dashboard" }
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(readHash)

  useEffect(() => {
    const onChange = () => setRoute(readHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    if (next.page === "message") {
      window.location.hash = `/m/${encodeURIComponent(next.id)}`
    } else if (next.page === "inbox") {
      window.location.hash = "/inbox"
    } else {
      // pushState does not fire hashchange, so update the state directly
      history.pushState(null, "", window.location.pathname + window.location.search)
      setRoute(next)
    }
  }, [])

  return [route, navigate]
}
