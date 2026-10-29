import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The commit this build was made from (Vercel provides it). Empty when built elsewhere; the Health page then says "unknown".
  define: { __BUILD_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || '') },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
