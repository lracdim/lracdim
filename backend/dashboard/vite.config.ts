import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the dashboard calls /api/studio on its own origin and Vite
// proxies it to the local Worker (`npm run dev` in worker/, port 8787), so no
// CORS setup is needed. Worker elsewhere? Start Vite with WORKER_URL, e.g.
// $env:WORKER_URL='http://127.0.0.1:8788'. In production set VITE_API_URL to
// the deployed Worker's /api/studio address instead (see .env.example).
const worker = process.env.WORKER_URL || 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api/studio': worker,
    },
  },
})
