# DevMail

A local development mail server .
- **Backend:** Spring Boot 3.5 (Java 21), a small built-in SMTP server, REST API, live updates over SSE
- **Frontend:** React + Vite + TypeScript + Tailwind v4 + [shadcn/ui](https://ui.shadcn.com)
- **Single jar:** `mvn package` builds the UI and bundles it into the Spring Boot jar

## Quick start

```bash
mvn spring-boot:run          # builds the UI (first run downloads Node), starts everything
```

- Web UI: http://localhost:8080
- SMTP: `localhost:2525`

Point your app at it. For a Spring Boot app:

```properties
spring.mail.host=localhost
spring.mail.port=2525
```

Quick test without an app:

```bash
python3 - <<'EOF'
import smtplib
from email.message import EmailMessage
m = EmailMessage()
m["From"], m["To"], m["Subject"] = "me@example.com", "you@example.com", "Hello from DevMail"
m.set_content("Plain text part")
m.add_alternative("<h1>Hello</h1><p>HTML part</p>", subtype="html")
smtplib.SMTP("localhost", 2525).send_message(m)
EOF
```

## Features

- HTML preview in a sandboxed iframe (no scripts), with desktop / tablet / mobile widths
- Plain text, all headers, and the raw message; download as `.eml`
- Attachments, inline `cid:` images, Cc, and Bcc (recipients that only appear in the SMTP envelope)
- Unread tracking, search, delete one / delete all, dark mode
- Live inbox: new mail appears instantly with a toast (Server-Sent Events)
- Accepts any AUTH PLAIN / LOGIN credentials, so apps configured with a username/password just work

## Configuration (`application.properties`)

| Property | Default | |
|---|---|---|
| `devmail.smtp.host` | `0.0.0.0` | Interface to bind |
| `devmail.smtp.port` | `2525` | SMTP port (`25` needs root) |
| `devmail.smtp.max-message-size` | `10MB` | Larger mail is rejected with `552` |
| `devmail.store.max-messages` | `500` | Oldest messages are dropped beyond this |
| `server.port` | `8080` | Web UI / API |

Any property can be overridden with an environment variable, e.g. `DEVMAIL_SMTP_PORT=1025`.

## Development

Run the backend and the Vite dev server separately for hot reload:

```bash
mvn spring-boot:run -DskipFrontend=true     # API on :8080, SMTP on :2525
cd frontend && npm install && npm run dev   # UI on :5173, proxies /api to :8080
```

`npm run build` writes into `src/main/resources/static`, which Spring serves. That folder is git-ignored;
`mvn package` regenerates it (pass `-DskipFrontend=true` to reuse an existing build).

### Adding shadcn components

`frontend/components.json` is configured, so the CLI works as usual:

```bash
cd frontend && npx shadcn@latest add dialog dropdown-menu
```

## REST API

| | |
|---|---|
| `GET /api/messages?q=` | List (newest first) with `total` and `unread` counts |
| `GET /api/messages/{id}` | Full message: bodies, headers, attachments |
| `POST /api/messages/{id}/read` | Mark as read |
| `DELETE /api/messages/{id}` / `DELETE /api/messages` | Delete one / all |
| `GET /api/messages/{id}/raw[?download=true]` | Raw message / `.eml` download |
| `GET /api/messages/{id}/html` | HTML body for the preview frame |
| `GET /api/messages/{id}/attachments/{attachmentId}` | Attachment bytes |
| `GET /api/events` | SSE stream: `message-added`, `message-updated`, `message-deleted`, `cleared` |
| `GET /api/server` | SMTP host/port and mailbox info |

## Project layout

```
src/main/java/dev/devmail/
  smtp/    SmtpServer (plain-JDK SMTP sink), SmtpServerLifecycle
  mail/    MailParser (MIME -> StoredMessage, via Jakarta Mail)
  store/   MessageStore (in-memory, capped), MailboxEvent
  web/     MessageController, SseBroadcaster, Dtos
frontend/src/
  components/ui/   shadcn components
  components/      message-list, message-view, empty-inbox
  hooks/           use-mailbox (SSE), use-selected-id, use-theme
```

## Limitations

- Messages live in memory and disappear on restart.
- No TLS / STARTTLS. Clients that *require* it will fail; plain connections work.
- Meant for local development. Don't expose it to untrusted networks.
