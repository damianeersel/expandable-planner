import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // PORT komt van de preview-tooling wanneer 5173 al bezet is (autoPort).
  server: { port: Number(process.env.PORT) || 5173 },
})
