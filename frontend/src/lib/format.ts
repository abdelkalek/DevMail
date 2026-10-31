export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

/** Short timestamp for the list: time today, otherwise the date. */
export function formatListTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export function formatFull(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
}

/** Relative time like the template's `.ago` label: "just now", "23m ago", "1h ago", "3d ago". */
export function formatAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** `"Jane Doe" <jane@example.com>` -> `Jane Doe`; bare addresses are returned as is. */
export function displayName(address: string): string {
  const m = address.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/)
  return m && m[1].trim() ? m[1].trim() : address.replace(/^<|>$/g, "")
}
