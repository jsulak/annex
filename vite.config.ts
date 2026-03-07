import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiPort = process.env.VITE_API_PORT || '3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/client',
  },
  server: {
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
});
