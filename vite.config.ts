import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import preserveDirectives from 'rollup-preserve-directives'

export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    // Disable treeshake to avoid Rollup "object is not extensible" crash
    rollupOptions: {
      treeshake: false,
      plugins: [
        // keep 'use client' etc. so Rollup doesn't error
        preserveDirectives(),
      ],
      // silence MODULE_LEVEL_DIRECTIVE warnings
      onwarn(warning, handler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        handler(warning)
      },
    },
  },
}) 