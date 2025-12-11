import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
    host: true,
    watch: {
      usePolling: true, // Needed for Docker volumes
    },
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
})
