export interface MessageSummary {
  id: string
  receivedAt: string
  from: string
  to: string[]
  subject: string
  preview: string
  size: number
  read: boolean
  attachmentCount: number
  hasHtml: boolean
}

export interface AttachmentInfo {
  id: string
  fileName: string
  contentType: string
  size: number
  inline: boolean
}

export interface MessageHeader {
  name: string
  value: string
}

export interface MessageDetail extends MessageSummary {
  envelopeFrom: string
  envelopeTo: string[]
  cc: string[]
  bcc: string[]
  sentAt: string | null
  textBody: string | null
  htmlBody: string | null
  headers: MessageHeader[]
  attachments: AttachmentInfo[]
}

export interface MessageList {
  messages: MessageSummary[]
  total: number
  unread: number
}

export interface ServerInfo {
  smtpHost: string
  smtpPort: number
  messageCount: number
  maxMessages: number
  version: string
}
