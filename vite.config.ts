import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // Phaser and pdf.js are large single libraries; split them into their own chunks.
    chunkSizeWarningLimit: 2500,
  },
});
