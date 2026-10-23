import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: { index: 'src/index.ts', protocol: 'src/protocol.ts' },
      formats: ['es'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
