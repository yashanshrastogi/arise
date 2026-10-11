import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/arise-[hash].js`,
        chunkFileNames: `assets/arise-[hash].js`,
        assetFileNames: `assets/arise-[hash].[ext]`,
      },
    },
  },
})
