import { useEffect, useState } from "react"
import { ArrowLeft, Download, FileText, Monitor, Paperclip, Smartphone, Tablet, Trash2 } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, attachmentUrl, emlUrl, htmlUrl } from "@/lib/api"
import { avatarGradient, initials } from "@/lib/avatar"
import { displayName, formatBytes, formatFull } from "@/lib/format"
import type { MessageDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

type Viewport = "desktop" | "tablet" | "mobile"

const VIEWPORTS: { key: Viewport; label: string; icon: typeof Monitor; width: string }[] = [
  { key: "desktop", label: "Desktop", icon: Monitor, width: "100%" },
  { key: "tablet", label: "Tablet (768px)", icon: Tablet, width: "768px" },
  { key: "mobile", label: "Mobile (375px)", icon: Smartphone, width: "375px" },
]

interface Props {
  id: string
  onBack: () => void
  onDeleted: () => void
}

export function MessageView({ id, onBack, onDeleted }: Props) {
  const [msg, setMsg] = useState<MessageDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [tab, setTab] = useState("html")
  const [viewport, setViewport] = useState<Viewport>("desktop")

  useEffect(() => {
    let cancelled = false
    setMsg(null)
    setRaw(null)
    setError(null)
    api
      .get(id)
      .then((m) => {
        if (cancelled) return
        setMsg(m)
        setTab(m.htmlBody ? "html" : "text")
        if (!m.read) void api.markRead(id)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (tab !== "raw" || raw !== null) return
    let cancelled = false
    api
      .raw(id)
      .then((text) => !cancelled && setRaw(text))
      .catch(() => !cancelled && setRaw("Could not load the raw message."))
    return () => {
      cancelled = true
    }
  }, [tab, id, raw])

  const remove = async () => {
    await api.remove(id)
    onDeleted()
  }

  if (error) {
    return (
      <div className="panel empty h-full">
        <div>
          <h3>Message unavailable</h3>
          <p>{error}. It may have been deleted.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={1.8} /> Back to inbox
        </button>
      </div>
    )
  }

  if (!msg) {
    return (
      <div className="panel flex h-full min-h-0 flex-col gap-4 p-5" aria-hidden="true">
        <div className="flex items-center gap-3">
          <span className="skel size-11 shrink-0 rounded-full" />
          <span className="flex-1 space-y-2">
            <span className="skel block h-4 w-1/2" />
            <span className="skel block h-3 w-1/3" />
          </span>
        </div>
        <span className="skel block h-3 w-full" />
        <span className="skel block h-64 w-full" />
      </div>
    )
  }

  const attachments = msg.attachments.filter((a) => !a.inline)
  const activeWidth = VIEWPORTS.find((v) => v.key === viewport)!.width
  const senderName = displayName(msg.from)

  return (
    <div className="panel flex h-full min-h-0 flex-col">
      <div className="panel-head items-start gap-3 py-4">
        <button type="button" className="btn-icon" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeft size={16} />
        </button>
        <span className="avatar avatar-lg" style={{ backgroundImage: avatarGradient(msg.from) }}>
          <span>{initials(senderName)}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="panel-title break-words">{msg.subject || "(no subject)"}</h1>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {msg.from} → {msg.to.length ? msg.to.join(", ") : "—"}
          </p>
        </div>
        <div className="panel-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <a className="btn-icon" href={emlUrl(msg.id)} aria-label="Download .eml">
                <Download size={15} />
              </a>
            </TooltipTrigger>
            <TooltipContent>Download .eml</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="btn-icon" onClick={remove} aria-label="Delete message">
                <Trash2 size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <dl className="grid shrink-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 text-[13px] md:px-5">
        <Field label="From" value={[msg.from]} />
        <Field label="To" value={msg.to} />
        {msg.cc.length > 0 && <Field label="Cc" value={msg.cc} />}
        {msg.bcc.length > 0 && <Field label="Bcc" value={msg.bcc} />}
        <Field label="Date" value={[formatFull(msg.sentAt ?? msg.receivedAt)]} plain />
        <Field label="Envelope" value={[`${msg.envelopeFrom || "<>"} → ${msg.envelopeTo.join(", ")}`]} plain muted />
      </dl>

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <div className="tabs-bar">
          <TabsList className="tabs tabs-plain">
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
            <TabsTrigger value="attachments">
              <Paperclip size={13} strokeWidth={1.7} /> Attachments
              {attachments.length > 0 && <span className="tab-count">{attachments.length}</span>}
            </TabsTrigger>
          </TabsList>

          {tab === "html" && msg.htmlBody && (
            <div className="hidden gap-1 sm:flex">
              {VIEWPORTS.map(({ key, label, icon: Icon }) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn("btn-icon", viewport === key && "is-on")}
                      onClick={() => setViewport(key)}
                      aria-label={label}
                      aria-pressed={viewport === key}
                    >
                      <Icon size={15} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>

        <TabsContent value="html">
          {msg.htmlBody ? (
            <div className="flex h-full justify-center overflow-auto p-0 sm:p-4">
              <iframe
                key={msg.id}
                title="HTML body"
                src={htmlUrl(msg.id)}
                // No allow-same-origin / allow-scripts: the message cannot touch this app or run code.
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                style={{ width: activeWidth }}
                className="h-full min-h-[24rem] max-w-full rounded-xl border border-border bg-white shadow-sm"
              />
            </div>
          ) : (
            <Empty icon={FileText} text="This message has no HTML part. Check the Text tab." />
          )}
        </TabsContent>

        <TabsContent value="text">
          {msg.textBody ? (
            <ScrollArea className="h-full">
              <pre className="code code-standalone m-4 whitespace-pre-wrap break-words md:m-5">{msg.textBody}</pre>
            </ScrollArea>
          ) : (
            <Empty icon={FileText} text="This message has no plain-text part." />
          )}
        </TabsContent>

        <TabsContent value="headers">
          <ScrollArea className="h-full">
            <table className="headers">
              <tbody>
                {msg.headers.map((h, i) => (
                  <tr key={i}>
                    <th>{h.name}</th>
                    <td>{h.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="raw">
          <ScrollArea className="h-full">
            <pre className="code code-standalone m-4 whitespace-pre-wrap break-all md:m-5">{raw ?? "Loading…"}</pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="attachments">
          {attachments.length === 0 ? (
            <Empty icon={Paperclip} text="This message has no attachments." />
          ) : (
            <ScrollArea className="h-full">
              <ul className="divide-y divide-border">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                      <Paperclip size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.contentType} · {formatBytes(a.size)}
                      </p>
                    </div>
                    <a className="btn btn-outline btn-sm" href={attachmentUrl(msg.id, a.id)}>
                      <Download size={13} strokeWidth={1.8} /> Download
                    </a>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Field({ label, value, plain, muted }: { label: string; value: string[]; plain?: boolean; muted?: boolean }) {
  return (
    <>
      <dt className="pt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("flex min-w-0 flex-wrap items-center gap-1", muted && "text-xs text-muted-foreground")}>
        {value.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : plain ? (
          <span className="break-all">{value.join(", ")}</span>
        ) : (
          value.map((v, i) => (
            <span key={i} className="badge max-w-full">
              <span className="truncate">{v}</span>
            </span>
          ))
        )}
      </dd>
    </>
  )
}

function Empty({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="empty h-full min-h-48">
      <div className="flex flex-col items-center gap-2">
        <Icon className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}
