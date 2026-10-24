import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The code only imports the stylesheet `?inline` (for mountDesignPad and
 * Shadow DOM), so ship it as dist/editor.css for `@design-pad/editor/styles.css`.
 */
function emitStylesheet(): Plugin {
  return {
    name: 'design-pad:emit-stylesheet',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'editor.css',
        source: readFileSync(resolve(import.meta.dirname, 'src/styles/editor.css'), 'utf8'),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), emitStylesheet()],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    sourcemap: true,
    emptyOutDir: true,
    rolldownOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^@design-pad\//, /^lucide-react/],
    },
  },
});
