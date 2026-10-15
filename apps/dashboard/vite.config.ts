import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { fileURLToPath } from 'node:url';


export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5174 },
  build: { target: 'es2022', sourcemap: false },
});
