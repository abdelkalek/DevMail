import { useEffect, useMemo, useState } from "react"
import { Inbox, Mail, Moon, RefreshCw, Search, Sun, Trash2 } from "lucide-react"

import { Dashboard } from "@/components/dashboard"
import { EmptyInbox } from "@/components/empty-inbox"
import { MessageList } from "@/components/message-list"
import { MessageView } from "@/components/message-view"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Toaster } from "@/components/ui/sonner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useMailbox } from "@/hooks/use-mailbox"
import { useRoute } from "@/hooks/use-route"
import { useTheme } from "@/hooks/use-theme"
import { api } from "@/lib/api"
import type { ServerInfo } from "@/lib/types"
import { cn } from "@/lib/utils"

type Filter = "all" | "unread" | "attach"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "attach", label: "With attachments" },
]

export default function App() {
  const { theme, setTheme } = useTheme()
  const [route, navigate] = useRoute()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const { data, error, connected, refresh } = useMailbox(debounced)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    api.info().then(setInfo).catch(() => undefined)
  }, [])

  const messages = data?.messages ?? null
  const isEmpty = data !== null && data.total === 0
  const unread = data?.unread ?? 0
  const smtpHost = info?.smtpHost && info.smtpHost !== "0.0.0.0" ? info.smtpHost : "localhost"
  const smtpPort = info?.smtpPort ?? 2525

  const shown = useMemo(() => {
    const list = messages ?? []
    if (filter === "unread") return list.filter((m) => !m.read)
    if (filter === "attach") return list.filter((m) => m.attachmentCount > 0)
    return list
  }, [messages, filter])

  const allChecked = shown.length > 0 && shown.every((m) => checked.has(m.id))

  const toggleChecked = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setChecked(allChecked ? new Set() : new Set(shown.map((m) => m.id)))

  const clearAll = async () => {
    await api.clear()
    setChecked(new Set())
    navigate({ page: "inbox" })
    void refresh()
  }

  const markRead = async (ids: string[]) => {
    await Promise.all(ids.map((id) => api.markRead(id)))
    void refresh()
  }

  const bulkRead = async () => {
    await markRead([...checked])
    setChecked(new Set())
  }

  const bulkDelete = async () => {
    await Promise.all([...checked].map((id) => api.remove(id)))
    setChecked(new Set())
    void refresh()
  }

  const markAllRead = async () => {
    await markRead((messages ?? []).filter((m) => !m.read).map((m) => m.id))
  }

  return (
    <TooltipProvider>
      <div className="app">
        <aside className="sidebar">
          <a className="brand" href="#/">
            <span className="brand-mark">
              <Mail size={19} strokeWidth={1.8} />
            </span>
            <span>
              <span className="brand-name">DevMail</span>
              <span className="brand-sub">Local SMTP capture</span>
            </span>
          </a>

          <nav className="nav" aria-label="Main">
            <p className="nav-label">Mail server</p>
            <a
              className={cn("nav-link", route.page === "dashboard" && "is-active")}
              href="#/"
              aria-current={route.page === "dashboard" ? "page" : undefined}
            >
              <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                <path d="m13.4 10.6 3.6-3.6" />
                <path d="M20.5 15.5a9 9 0 1 0-17 0" />
              </svg>
              Dashboard <span className="chev">›</span>
            </a>
            <a
              className={cn("nav-link", route.page !== "dashboard" && "is-active")}
              href="#/inbox"
              aria-current={route.page !== "dashboard" ? "page" : undefined}
            >
              <Inbox size={17} strokeWidth={1.6} />
              Inbox
              {unread > 0 && <span className="badge-count">{unread}</span>}
              <span className="chev">›</span>
            </a>
          </nav>

          <div className="sidebar-tip">
            <h4>Point your app at</h4>
            <code>
              {smtpHost}:{smtpPort}
            </code>
            <p>No credentials, no TLS. Everything is captured locally and nothing is ever relayed.</p>
          </div>
        </aside>

        <div className="shell">
          <header className="topbar">
            <h1>{route.page === "dashboard" ? "Dashboard" : "Inbox"}</h1>
            <div className="topbar-actions">
              <div className="seg" data-theme={theme} role="group" aria-label="Appearance">
                <span className="seg-thumb" aria-hidden="true" />
                <button
                  type="button"
                  data-theme="light"
                  className={cn(theme === "light" && "is-on")}
                  onClick={() => setTheme("light")}
                  aria-pressed={theme === "light"}
                >
                  <Sun size={14} strokeWidth={1.7} />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  data-theme="dark"
                  className={cn(theme === "dark" && "is-on")}
                  onClick={() => setTheme("dark")}
                  aria-pressed={theme === "dark"}
                >
                  <Moon size={14} strokeWidth={1.7} />
                  <span>Dark</span>
                </button>
              </div>

              <span
                className={cn("status-pill", !connected && "is-off")}
                title={connected ? "Live updates connected" : "Reconnecting…"}
              >
                <i className="dot" />
                <span>SMTP :{smtpPort}</span>
              </span>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="btn-icon" onClick={() => void refresh()} aria-label="Refresh">
                    <RefreshCw size={15} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <main className={cn("content", route.page !== "dashboard" && "content-full min-h-0 flex-1")}>
            {route.page === "message" ? (
              <MessageView
                key={route.id}
                id={route.id}
                onBack={() => navigate({ page: "inbox" })}
                onDeleted={() => {
                  navigate({ page: "inbox" })
                  void refresh()
                }}
              />
            ) : route.page === "dashboard" ? (
              <Dashboard
                messages={messages}
                total={data?.total ?? info?.messageCount ?? 0}
                unread={unread}
                info={info}
                connected={connected}
                smtpHost={smtpHost}
                smtpPort={smtpPort}
                onOpenInbox={() => navigate({ page: "inbox" })}
                onRefresh={() => void refresh()}
              />
            ) : (
              <>
                <div className="page-head">
                  <div>
                    <p className="page-eyebrow">Mail server</p>
                    <h1 className="page-title">Inbox</h1>
                    <p className="page-sub">
                      {data
                        ? `${data.total} captured in total · showing ${shown.length} · ${unread} unread`
                        : "Loading…"}
                      {error && " · can't reach server"}
                    </p>
                  </div>
                  <div className="page-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => void markAllRead()}
                      disabled={!data || unread === 0}
                    >
                      Mark all read
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => void refresh()}>
                      Refresh
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" className="btn btn-danger" disabled={!data || data.total === 0}>
                          <Trash2 size={14} strokeWidth={1.8} /> Empty inbox
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete all messages?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes all {data?.total ?? 0} captured messages. It cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void clearAll()}>Delete all</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <section className="panel">
                  <div className="toolbar">
                    <label className="select-all" title="Select visible emails">
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                      <span>Select all</span>
                    </label>

                    <div className="search">
                      <Search size={15} strokeWidth={1.6} />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search subject, sender, recipient…"
                        aria-label="Search messages"
                      />
                    </div>

                    <div className="chips" role="group" aria-label="Filter">
                      {FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          className={cn("chip", filter === f.key && "is-on")}
                          aria-pressed={filter === f.key}
                          onClick={() => setFilter(f.key)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {checked.size > 0 && (
                    <div className="bulkbar">
                      <span className="bulk-count">{checked.size}</span>
                      <span className="bulk-label">selected</span>
                      <div className="bulk-actions">
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => void bulkRead()}>
                          Mark read
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => void bulkDelete()}>
                          Delete
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setChecked(new Set())}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}

                  {isEmpty ? (
                    <EmptyInbox />
                  ) : (
                    <>
                      <MessageList
                        messages={messages === null ? null : shown}
                        selectedId={null}
                        checked={checked}
                        onToggleCheck={toggleChecked}
                        onMarkRead={(id) => void markRead([id])}
                        onSelect={(id) => navigate({ page: "message", id })}
                        searching={debounced !== "" || filter !== "all"}
                      />
                      <div className="kv kv-footer">
                        <span className="font-mono text-[11.5px] text-muted-foreground">
                          {shown.length} of {data?.total ?? 0} message(s)
                        </span>
                        <span className="font-mono text-[11.5px] text-[var(--signal-500)]">
                          {unread} unread
                        </span>
                      </div>
                    </>
                  )}
                </section>
              </>
            )}
          </main>

          <footer className="foot">
            <span>DevMail — local SMTP capture server for development.</span>
            <span>No mail is ever relayed to the internet.</span>
          </footer>
        </div>
      </div>
      <Toaster theme={theme} position="bottom-right" />
    </TooltipProvider>
  )
}
