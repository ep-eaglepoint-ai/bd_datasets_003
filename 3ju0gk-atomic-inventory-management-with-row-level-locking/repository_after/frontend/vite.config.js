import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 1. Tell Vite where the index.html is actually located
  // If you moved it to the frontend root, remove the line below.
  // If it's still in public, keep it.
  root: './', 
  
  server: {
    // 2. Open the gates so Docker can talk to your Mac
    host: '0.0.0.0', 
    port: 5173,
    strictPort: true,
    
    // 3. Setup the Proxy so 'fetch("/api/...")' works
    proxy: {
      '/api': {
        target: 'http://app:8000',
        changeOrigin: true,
      },
    },
    
    // 4. Critical for Mac/Docker: Detect file changes
    watch: {
      usePolling: true,
    },
  },
})