import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // server: { port: 5173, proxy: { '/api': 'http://47.108.89.220:3001' } },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3001' } },
})
