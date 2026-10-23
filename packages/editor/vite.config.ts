import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'editor' },
    sourcemap: true,
    emptyOutDir: true,
    rolldownOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^@design-pad\//, /^lucide-react/],
    },
  },
});
