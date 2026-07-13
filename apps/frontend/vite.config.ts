// Trigger dev server restart after pnpm lockfile update
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    glsl({ include: ['**/*.glsl'] }),
  ],
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            // App-side chunking — keep the new 3D universe in its own bundle
            if (id.includes('/src/three-universe/')) return 'three-universe';
            return undefined;
          }
          if (id.includes('/three/')) return 'three-core';
          if (id.includes('@react-three/fiber')) return 'r3f-vendor';
          if (id.includes('@react-three/drei')) return 'drei-vendor';
          if (id.includes('postprocessing')) return 'postprocessing-vendor';
          if (id.includes('gsap')) return 'gsap-vendor';
          if (id.includes('recharts')) return 'charts-vendor';
          if (id.includes('react-router')) return 'router-vendor';
          return 'vendor';
        },
      },
    },
  },
})
