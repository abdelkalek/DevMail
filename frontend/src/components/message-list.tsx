import type { CSSProperties } from "react"
import { Mail, Paperclip } from "lucide-react"

import { avatarGradient, initials } from "@/lib/avatar"
import { displayName, formatAgo, formatListTime } from "@/lib/format"
import type { MessageSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  messages: MessageSummary[] | null
  selectedId: string | null
  checked: Set<string>
  onToggleCheck: (id: string) => void
  onMarkRead: (id: string) => void
  onSelect: (id: string) => void
  searching: boolean
}

export function MessageList({ messages, selectedId, checked, onToggleCheck, onMarkRead, onSelect, searching }: Props) {
  if (messages === null) {
    return (
      <div className="space-y-4 p-4" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="skel size-6 shrink-0 rounded-full" />
            <span className="flex-1 space-y-2">
              <span className="skel block h-3 w-1/3" />
              <span className="skel block h-3 w-4/5" />
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (messages.length === 0 && searching) {
    return (
      <div className="empty">
        <div>
          <h3>No matches</h3>
          <p>No messages match your search or filter.</p>
        </div>
      </div>
    )
  }

  return (
    <ul className="mail-list stagger">
      {messages.map((m, i) => {
        const selected = m.id === selectedId
        const isChecked = checked.has(m.id)
        const name = displayName(m.from)
        return (
          <li
            key={m.id}
            style={{ "--i": i } as CSSProperties}
            className={cn(
              "mail-row group",
              m.read ? "is-read" : "is-unread",
              (selected || isChecked) && "is-selected",
            )}
            aria-current={selected ? "true" : undefined}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleCheck(m.id)}
              aria-label={`Select ${m.subject || "(no subject)"}`}
            />
            <span className="avatar avatar-xs avatar-row" style={{ backgroundImage: avatarGradient(m.from) }}>
              <span>{initials(name)}</span>
            </span>
            <button type="button" className="row-body" onClick={() => onSelect(m.id)}>
              <span className="row-sender">
                {!m.read && <i className="dot-unread" aria-label="Unread" />}
                <span className="name">{name}</span>
              </span>
              <span className="row-main">
                <span className="row-subject">{m.subject || "(no subject)"}</span>
                {m.preview && <span className="row-snippet">— {m.preview}</span>}
                {m.attachmentCount > 0 && (
                  <span className="row-attach" title={`${m.attachmentCount} attachment(s)`}>
                    <Paperclip size={12} strokeWidth={1.6} />
                    {m.attachmentCount}
                  </span>
                )}
              </span>
              <span className="row-time">
                <span className="when">{formatListTime(m.receivedAt)}</span>
                <span className="ago">{formatAgo(m.receivedAt)}</span>
              </span>
            </button>
            {!m.read && (
              <button
                type="button"
                className="btn-icon row-action"
                title="Mark as read"
                aria-label="Mark as read"
                onClick={() => onMarkRead(m.id)}
              >
                <Mail size={14} strokeWidth={1.6} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
