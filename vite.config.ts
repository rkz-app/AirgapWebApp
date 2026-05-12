import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['airgap', 'airgap-web'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
    allowedHosts: true,
  },
})
