const GRADIENTS = [
  "linear-gradient(145deg,#3b9dff,#0a66d6)",
  "linear-gradient(145deg,#8e8bff,#5a4ee0)",
  "linear-gradient(145deg,#ffb340,#ef7e00)",
  "linear-gradient(145deg,#4fd0e6,#0a95b4)",
  "linear-gradient(145deg,#c87bf5,#9333d1)",
  "linear-gradient(145deg,#34c759,#1d8348)",
  "linear-gradient(145deg,#ff7a92,#d70015)",
]

/** Deterministic avatar gradient for a sender identity. */
export function avatarGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

/** Up to two initials for an avatar, e.g. "Ada Lovelace" -> "AL". */
export function initials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 .@_-]/g, " ").trim()
  if (!cleaned) return "?"
  const words = cleaned.split(/[\s._@-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return cleaned.slice(0, 2).toUpperCase()
}
