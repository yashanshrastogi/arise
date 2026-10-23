import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const stage = env.VITE_STAGE || mode

  if (stage === 'staging') {
    const apiUrl = (env.VITE_API_URL || '').trim()
    if (!apiUrl || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      throw new Error(
        'Configuration Error: Missing or invalid VITE_API_URL for staging build. Staging builds must explicitly specify a staging API endpoint and cannot use localhost or fall back to production.'
      )
    }
    if (apiUrl.includes('/prod') || apiUrl.includes('ll84ry8heh.execute-api')) {
      throw new Error(
        'Configuration Error: Staging build cannot use production API URL.'
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/oidc-client-ts') || id.includes('node_modules/react-oidc-context')) {
              return 'vendor-auth';
            }
          },
          entryFileNames: `assets/arise-[hash].js`,
          chunkFileNames: `assets/arise-[hash].js`,
          assetFileNames: `assets/arise-[hash].[ext]`,
        },
      },
    },
  }
})
