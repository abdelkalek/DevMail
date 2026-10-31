import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// In production the build lands in Spring Boot's static resources, so the jar
// serves the UI. In dev, Vite runs on :5173 and proxies /api to Spring on :8080.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  build: { outDir: "../src/main/resources/static", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:8080" } },
})
