import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, forward API + site previews to FastAPI on :8000
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Anchored regexes: a bare '/s' prefix would also capture Vite's own '/src/...' modules.
      '^/api/': 'http://localhost:8000',
      '^/s/': 'http://localhost:8000',
      '^/media/': 'http://localhost:8000',
    },
  },
});
