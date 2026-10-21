import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'webview-ui'),
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'webview-ui/src/main.tsx'),
      output: {
        format: 'iife',
        name: 'ArchiEditorWebview',
        inlineDynamicImports: true,
        entryFileNames: 'webview.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'webview.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
