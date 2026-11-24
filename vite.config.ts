/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import { execSync } from 'child_process'

let gitCommit = 'dev'
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  gitCommit = 'dev'
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@v1': path.resolve(__dirname, './src/v1'),
      '@v2': path.resolve(__dirname, './src/v2'),
      'THREE': 'three',
    },
    dedupe: ['three'],
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/node_modules/react/') || normalized.includes('/node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (normalized.includes('/node_modules/@react-three/')) {
            return 'vendor-r3f';
          }
          if (normalized.includes('/node_modules/three/') || normalized.includes('/node_modules/three-mesh-bvh/')) {
            return 'vendor-three';
          }
          if (normalized.includes('/node_modules/three-geo/')) {
            return 'vendor-mapbox-terrain';
          }
          if (normalized.includes('/node_modules/geotiff/') || normalized.includes('/node_modules/proj4/')) {
            return 'vendor-geo';
          }
          if (normalized.includes('/node_modules/gsap/')) {
            return 'vendor-utils';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      // ZBGIS Ortofoto — GKÚ
      '/wms-proxy/orto': {
        target: 'https://zbgisws.skgeodesy.sk',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wms-proxy\/orto/, '/zbgis_ortofoto_wms/service.svc/get'),
      },
      // INSPIRE WCS DMR 5.0 (GKÚ SR)
      '/wcs-proxy/el': {
        target: 'https://inspirews.skgeodesy.sk',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wcs-proxy\/el/, '/geoserver/el/ows'),
      },
      // Geologická mapa — ags.geology.sk (WMS 1.1.1 ArcGIS)
      '/wms-proxy/geology': {
        target: 'https://ags.geology.sk',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wms-proxy\/geology/, '/arcgis/services/WebServices/GM50/MapServer/WMSServer'),
      },
      // ZBGIS DMR (Digital Terrain Model) — includes Hillshade
      '/wms-proxy/shadow': {
        target: 'https://zbgisws.skgeodesy.sk',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wms-proxy\/shadow/, '/zbgis_dmr_wms/service.svc/get'),
      },
      // XYZ Tile Proxies for scraping
      '/xyz-proxy/zbgis': {
        target: 'https://zbgis.skgeodesy.sk',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/xyz-proxy\/zbgis/, '/zbgis/rest/services'),
      },
      '/xyz-proxy/freemap-orto': {
        target: 'https://ortofoto.tiles.freemap.sk',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/xyz-proxy\/freemap-orto/, ''),
      },
      '/xyz-proxy/freemap-shading': {
        target: 'https://dmr5-shading.tiles.freemap.sk',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/xyz-proxy\/freemap-shading/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
})
