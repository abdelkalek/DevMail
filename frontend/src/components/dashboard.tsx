import { useMemo } from "react"
import type { CSSProperties } from "react"
import { toast } from "sonner"

import { avatarGradient, initials } from "@/lib/avatar"
import { displayName, formatBytes } from "@/lib/format"
import type { MessageSummary, ServerInfo } from "@/lib/types"

interface DashboardProps {
  messages: MessageSummary[] | null
  total: number
  unread: number
  info: ServerInfo | null
  connected: boolean
  smtpHost: string
  smtpPort: number
  onOpenInbox: () => void
  onRefresh: () => void
}

const BAR_COLORS = ["var(--signal-500)", "var(--info)", "var(--warn)", "var(--ok)"]

const varStyle = (vars: Record<string, string | number>) => vars as CSSProperties

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(label)
  } catch {
    toast.error("Copy failed")
  }
}

/** `"Jane Doe" <jane@example.com>` -> `jane@example.com`; bare addresses are returned as is. */
function emailOf(address: string): string {
  const m = address.match(/<([^>]+)>/)
  return (m ? m[1] : address).trim()
}

/** Catmull-Rom smoothing turned into a cubic-bezier SVG path, like the template chart. */
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length < 2) return ""
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

export function Dashboard({
  messages,
  total,
  unread,
  info,
  connected,
  smtpHost,
  smtpPort,
  onOpenInbox,
  onRefresh,
}: DashboardProps) {
  const httpPort = window.location.port || "80"

  const attachments = useMemo(
    () => (messages ?? []).reduce((n, m) => n + m.attachmentCount, 0),
    [messages],
  )
  const bytes = useMemo(() => (messages ?? []).reduce((n, m) => n + m.size, 0), [messages])

  /** Messages per hour over the last 24h; the right edge is the current hour. */
  const hourly = useMemo(() => {
    const buckets: number[] = new Array(24).fill(0)
    const now = Date.now()
    for (const m of messages ?? []) {
      const ageH = (now - new Date(m.receivedAt).getTime()) / 3_600_000
      if (ageH >= 0 && ageH < 24) buckets[23 - Math.floor(ageH)]++
    }
    return buckets
  }, [messages])

  const chart = useMemo(() => {
    const max = Math.max(...hourly)
    const pts = hourly.map(
      (v, i) => [(i * 1000) / 23, 274 - (max > 0 ? (v / max) * 244 : 0)] as [number, number],
    )
    const line = smoothPath(pts)
    const peakIdx = max > 0 ? hourly.indexOf(max) : -1
    return {
      line,
      area: line ? `${line} L 1000 300 L 0 300 Z` : "",
      peak: peakIdx >= 0 ? { x: pts[peakIdx][0], y: pts[peakIdx][1] } : null,
    }
  }, [hourly])

  const senders = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of messages ?? []) {
      const key = m.from || "(unknown)"
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
  }, [messages])

  const version = info?.version ?? "dev"
  const versionLabel = /^\d/.test(version) ? `v${version}` : version

  const snippet = `const transport = nodemailer.createTransport({
  host: "${smtpHost}",
  port: ${smtpPort},
  secure: false,
  tls: { rejectUnauthorized: false },
});`

  return (
    <>
      {/* ============================== hero ============================== */}
      <section className="panel hero">
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <span className="badge badge-ok">
              <i
                className="dot"
                style={{ width: 6, height: 6, borderRadius: 999, background: "var(--ok-dot)" }}
              />
              Capturing
            </span>
            <span className="badge">{versionLabel}</span>
            <span className="badge badge-info">{smtpHost}</span>
          </div>

          <h2>
            Every message your app sends,
            <br />
            <em>caught before it leaves the building.</em>
          </h2>
          <p>
            DevMail runs a real SMTP listener, parses the MIME, stores attachments and streams
            every capture to this dashboard live — nothing is ever relayed to the internet.
          </p>

          <div className="hero-actions">
            <button type="button" className="btn btn-primary" onClick={onOpenInbox}>
              Open inbox
            </button>
            <button type="button" className="btn btn-outline" onClick={onRefresh}>
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void copyText(`${smtpHost}:${smtpPort}`, "SMTP address copied")}
            >
              Copy SMTP address
            </button>
          </div>
        </div>

        {/* decorative SVG mark */}
        <svg
          viewBox="0 0 200 200"
          width={148}
          height={148}
          fill="none"
          aria-hidden="true"
          className="float-y"
          style={{ position: "absolute", top: 32, right: 32, opacity: 0.9 }}
        >
          <g className="spin-slow" style={{ transformOrigin: "100px 100px" }}>
            <circle cx={100} cy={100} r={78} stroke="var(--ink-600)" strokeWidth={1} strokeDasharray="3 9" />
            <circle cx={178} cy={100} r={4.5} fill="var(--signal-500)" />
          </g>
          <g
            className="spin-slow"
            style={{ transformOrigin: "100px 100px", animationDirection: "reverse", animationDuration: "14s" }}
          >
            <circle cx={100} cy={100} r={62} stroke="var(--ink-700)" strokeWidth={1} />
            <circle cx={100} cy={38} r={3.5} fill="var(--ok-dot)" />
          </g>
          <rect x={48} y={66} width={104} height={70} rx={13} fill="var(--signal-500)" />
          <path
            d="M54 78 93.6 106.3a11 11 0 0 0 12.8 0L146 78"
            stroke="#fff"
            strokeOpacity={0.95}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            className="draw"
            style={varStyle({ "--len": 140 })}
          />
          <circle cx={100} cy={101} r={7} fill="#fff" opacity={0.9} />
        </svg>
      </section>

      <div className="hero-strip panel" style={{ borderRadius: 0, marginTop: -1 }}>
        <span className="ep">
          <i />
          <b>SMTP</b>
          <span>
            {smtpHost}:{smtpPort}
          </span>
        </span>
        <span className="ep">
          <i />
          <b>HTTP</b>
          <span>
            {smtpHost}:{httpPort}
          </span>
        </span>
        <span className="ep">
          <i />
          <b>SSE</b>
          <span>/api/events</span>
        </span>
      </div>

      <div style={{ height: 20 }} />

      {/* ============================== stats ============================== */}
      <div className="grid-stats stagger">
        <div className="panel stat lift" style={varStyle({ "--i": 0 })}>
          <span className="stat-label">Messages captured</span>
          <p className="stat-value">{messages ? total : "—"}</p>
          <p className="stat-hint">since server start</p>
          <span className="stat-icon" style={{ background: "rgba(0,113,227,.12)", color: "var(--signal-500)" }}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.6}>
              <rect x={2.5} y={4.5} width={19} height={15} rx={2} />
              <path d="m3 6.5 8.1 5.7a1.6 1.6 0 0 0 1.8 0L21 6.5" />
            </svg>
          </span>
        </div>
        <div className="panel stat lift" style={varStyle({ "--i": 1 })}>
          <span className="stat-label">Unread</span>
          <p className="stat-value">{messages ? unread : "—"}</p>
          <p className="stat-hint">Resets when you open a message</p>
          <span className="stat-icon" style={{ background: "rgba(94,92,230,.12)", color: "var(--info)" }}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M3 12h4l1.6 2.6a2 2 0 0 0 1.7.9h3.4a2 2 0 0 0 1.7-.9L17 12h4" />
              <path d="M4.6 5.6 3 12v5.5A1.5 1.5 0 0 0 4.5 19h15a1.5 1.5 0 0 0 1.5-1.5V12l-1.6-6.4A2 2 0 0 0 17.5 4h-11a2 2 0 0 0-1.9 1.6Z" />
            </svg>
          </span>
        </div>
        <div className="panel stat lift" style={varStyle({ "--i": 2 })}>
          <span className="stat-label">Attachments</span>
          <p className="stat-value">{messages ? attachments : "—"}</p>
          <p className="stat-hint">stored in memory</p>
          <span className="stat-icon" style={{ background: "rgba(178,80,0,.12)", color: "var(--warn)" }}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M20 11.5 12.3 19a4.6 4.6 0 0 1-6.5-6.5l8-7.9a3.1 3.1 0 1 1 4.4 4.4l-7.9 8a1.6 1.6 0 0 1-2.2-2.2l7.2-7.2" />
            </svg>
          </span>
        </div>
        <div className="panel stat lift" style={varStyle({ "--i": 3 })}>
          <span className="stat-label">Inbox size</span>
          <p className="stat-value">{messages ? formatBytes(bytes) : "—"}</p>
          <p className="stat-hint">up to {info?.maxMessages ?? 500} msgs retained</p>
          <span className="stat-icon" style={{ background: "rgba(0,113,227,.12)", color: "var(--signal-500)" }}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.6}>
              <rect x={3} y={4} width={18} height={7} rx={2} />
              <rect x={3} y={13} width={18} height={7} rx={2} />
              <path d="M7 7.5h.01M7 16.5h.01" />
            </svg>
          </span>
        </div>
      </div>

      <div style={{ height: 20 }} />

      <div style={{ display: "grid", gap: 20 }} className="lg-3">
        {/* ============================== listeners ============================== */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Listeners</h3>
              <p className="panel-sub">Bound TCP sockets on this host</p>
            </div>
          </div>
          <div>
            <div className="kv">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <svg viewBox="0 0 34 34" width={34} height={34} fill="none" aria-hidden="true">
                  <rect x={1} y={1} width={32} height={32} rx={10} fill="var(--signal-500)" fillOpacity={0.12} />
                  <g stroke="var(--signal-500)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none">
                    <path d="M9 12.5h16v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 9 22Z" />
                    <path d="m10 13.5 6 4.3a1.6 1.6 0 0 0 2 0l6-4.3" />
                    <path d="M17 7.5v3.2" />
                  </g>
                  <circle cx={27} cy={7} r={3} fill="var(--ok-dot)" />
                </svg>
                <div>
                  <div style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--mist-100)" }}>SMTP</div>
                  <div style={{ fontSize: 12, color: "var(--mist-600)" }}>Inbound capture</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--signal-500)" }}>:{smtpPort}</div>
                <div style={{ fontSize: "10.5px", color: "var(--mist-600)" }}>listening</div>
              </div>
            </div>
            <div className="kv">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <svg viewBox="0 0 34 34" width={34} height={34} fill="none" aria-hidden="true">
                  <rect x={1} y={1} width={32} height={32} rx={10} fill="var(--info)" fillOpacity={0.12} />
                  <g stroke="var(--info)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none">
                    <rect x={9} y={9} width={16} height={16} rx={3} />
                    <path d="M9 15h4l1.4 2.2h5.2L21 15h4" />
                  </g>
                  <circle cx={27} cy={7} r={3} fill="var(--ok-dot)" />
                </svg>
                <div>
                  <div style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--mist-100)" }}>REST API</div>
                  <div style={{ fontSize: 12, color: "var(--mist-600)" }}>Messages &amp; attachments</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--signal-500)" }}>:{httpPort}</div>
                <div style={{ fontSize: "10.5px", color: "var(--mist-600)" }}>listening</div>
              </div>
            </div>
            <div className="kv">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <svg viewBox="0 0 34 34" width={34} height={34} fill="none" aria-hidden="true">
                  <rect x={1} y={1} width={32} height={32} rx={10} fill="var(--mist-600)" fillOpacity={0.08} />
                  <g stroke="var(--mist-600)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none">
                    <path d="M17 8.5v9.5" />
                    <path d="m13.2 14.4 3.8 3.8 3.8-3.8" />
                    <path d="M9.5 20.5v2.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-2.2" />
                  </g>
                </svg>
                <div>
                  <div style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--mist-100)" }}>Live events</div>
                  <div style={{ fontSize: 12, color: "var(--mist-600)" }}>Server-sent events</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--signal-500)" }}>/api/events</div>
                <div style={{ fontSize: "10.5px", color: "var(--mist-600)" }}>
                  {connected ? "streaming" : "reconnecting"}
                </div>
              </div>
            </div>
            <div className="kv">
              <span className="kv-k">Messages stored</span>
              <span className="kv-v">{messages ? total : "—"}</span>
            </div>
            <div className="kv">
              <span className="kv-k">Retention cap</span>
              <span className="kv-v">{info?.maxMessages ?? 500} msgs</span>
            </div>
            <div className="kv">
              <span className="kv-k">Version</span>
              <span className="kv-v">{versionLabel}</span>
            </div>
          </div>
        </section>

        {/* ============================== chart ============================== */}
        <section className="panel" style={{ gridColumn: "span 2" }}>
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Capture volume</h3>
              <p className="panel-sub">Messages per hour of day</p>
            </div>
            <span className="badge badge-ok">24h</span>
          </div>
          <div className="panel-body">
            <svg
              viewBox="0 0 1000 300"
              preserveAspectRatio="none"
              style={{ width: "100%", height: 200, overflow: "visible" }}
              role="img"
              aria-label="Messages captured per hour"
            >
              <defs>
                <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--signal-500)" stopOpacity={0.32} />
                  <stop offset="55%" stopColor="var(--signal-500)" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="var(--signal-500)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--signal-500)" stopOpacity={0.55} />
                  <stop offset="50%" stopColor="var(--signal-500)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--signal-500)" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <g stroke="var(--ink-700)" strokeWidth={1}>
                <line x1={0} x2={1000} y1={22} y2={22} strokeDasharray="4 8" vectorEffect="non-scaling-stroke" />
                <line x1={0} x2={1000} y1={90} y2={90} strokeDasharray="4 8" vectorEffect="non-scaling-stroke" />
                <line x1={0} x2={1000} y1={158} y2={158} strokeDasharray="4 8" vectorEffect="non-scaling-stroke" />
                <line x1={0} x2={1000} y1={226} y2={226} strokeDasharray="4 8" vectorEffect="non-scaling-stroke" />
                <line x1={0} x2={1000} y1={274} y2={274} vectorEffect="non-scaling-stroke" />
              </g>
              {chart.area && <path fill="url(#fill)" d={chart.area} />}
              {chart.line && (
                <path
                  fill="none"
                  stroke="url(#stroke)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className="draw"
                  style={varStyle({ "--len": 2600 })}
                  d={chart.line}
                />
              )}
              {chart.peak && (
                <>
                  <line
                    x1={chart.peak.x}
                    x2={chart.peak.x}
                    y1={12}
                    y2={274}
                    stroke="var(--signal-500)"
                    strokeWidth={1}
                    strokeDasharray="3 5"
                    opacity={0.6}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={chart.peak.x} cy={chart.peak.y} r={12} fill="var(--signal-500)" opacity={0.16} />
                  <circle
                    cx={chart.peak.x}
                    cy={chart.peak.y}
                    r={5}
                    fill="var(--ink-900)"
                    stroke="var(--signal-500)"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>

            <div style={{ marginTop: 24, borderTop: "1px solid var(--ink-700)", paddingTop: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-600)", marginBottom: 14 }}>
                Busiest senders
              </p>
              {senders.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--mist-600)" }}>
                  No messages captured yet — point an app at {smtpHost}:{smtpPort} and send something.
                </p>
              ) : (
                <div className="stagger">
                  {senders.map(([from, count], i) => {
                    const pct = Math.max(8, Math.round((count / senders[0][1]) * 100))
                    const color = BAR_COLORS[i % BAR_COLORS.length]
                    return (
                      <div
                        key={from}
                        className="group"
                        style={varStyle({
                          "--i": i,
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: i < senders.length - 1 ? 10 : 0,
                        })}
                      >
                        <span className="avatar avatar-xs" style={{ backgroundImage: avatarGradient(from) }}>
                          <span>{initials(displayName(from))}</span>
                        </span>
                        <span
                          style={{
                            width: 192,
                            flexShrink: 0,
                            fontFamily: "var(--mono)",
                            fontSize: 12,
                            color: "var(--mist-400)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {emailOf(from)}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            height: 8,
                            borderRadius: 999,
                            background: "var(--ink-800)",
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              height: "100%",
                              width: `${pct}%`,
                              borderRadius: 999,
                              background: `linear-gradient(90deg,color-mix(in srgb,${color} 60%,transparent),${color})`,
                            }}
                          />
                        </span>
                        <span
                          style={{
                            width: 28,
                            textAlign: "right",
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--mist-500)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {count}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div style={{ height: 20 }} />

      {/* ============================== code ============================== */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">Wire up your app</h3>
            <p className="panel-sub">Copy a transport config for your stack</p>
          </div>
          <span className="badge">nodemailer</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr" }} className="md-2col">
          <div className="panel-body">
            <div className="code-head">
              <span className="dots">
                <i style={{ background: "#ff5f57" }} />
                <i style={{ background: "#febc2e" }} />
                <i style={{ background: "#28c840" }} />
              </span>
              <span className="lang">js</span>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => void copyText(snippet, "Config copied to clipboard")}
              >
                Copy
              </button>
            </div>
            <pre className="code">{snippet}</pre>
            <p style={{ marginTop: 12, fontSize: 12, color: "var(--mist-600)" }}>
              No TLS, no credentials, no outbound relay — by design.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
