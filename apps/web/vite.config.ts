import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Em dev, /api vai para a API: tela e API ficam no mesmo endereço (cookie SameSite funciona)
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
