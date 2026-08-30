import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Electron loads the packaged UI through file://, so asset URLs must be relative.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'build',
  },
})
