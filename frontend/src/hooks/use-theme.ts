import { useCallback, useEffect, useState } from "react"

export type Theme = "light" | "dark"

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme")
    if (saved === "light" || saved === "dark") return saved
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    const el = document.documentElement
    el.classList.toggle("dark", theme === "dark")
    // The Mailbox theme flips its tokens via [data-theme="dark"].
    el.setAttribute("data-theme", theme)
    el.style.colorScheme = theme
    try {
      localStorage.setItem("theme", theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [])
  return { theme, setTheme, toggle }
}
