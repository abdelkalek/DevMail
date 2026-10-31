import { Inbox } from "lucide-react"

export function EmptyInbox() {
  return (
    <div className="empty h-full">
      <span className="empty-icon">
        <Inbox size={24} strokeWidth={1.6} />
      </span>
      <div>
        <h3>Nothing here yet</h3>
        <p>Point your app at this SMTP server and the mail shows up instantly.</p>
      </div>
    </div>
  )
}
