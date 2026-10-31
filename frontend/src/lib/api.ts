import type { MessageDetail, MessageList, ServerInfo } from "@/lib/types"

async function ok(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res
}

export const api = {
  list: (q: string) =>
    fetch(`/api/messages${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then(ok)
      .then((r) => r.json() as Promise<MessageList>),
  get: (id: string) =>
    fetch(`/api/messages/${encodeURIComponent(id)}`)
      .then(ok)
      .then((r) => r.json() as Promise<MessageDetail>),
  raw: (id: string) =>
    fetch(`/api/messages/${encodeURIComponent(id)}/raw`)
      .then(ok)
      .then((r) => r.text()),
  markRead: (id: string) => fetch(`/api/messages/${encodeURIComponent(id)}/read`, { method: "POST" }).then(ok),
  remove: (id: string) => fetch(`/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" }).then(ok),
  clear: () => fetch("/api/messages", { method: "DELETE" }).then(ok),
  info: () =>
    fetch("/api/server")
      .then(ok)
      .then((r) => r.json() as Promise<ServerInfo>),
}

export const htmlUrl = (id: string) => `/api/messages/${encodeURIComponent(id)}/html`
export const emlUrl = (id: string) => `/api/messages/${encodeURIComponent(id)}/raw?download=true`
export const attachmentUrl = (id: string, attachmentId: string) =>
  `/api/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`
