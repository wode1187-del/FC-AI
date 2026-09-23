import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // 开发环境用根路径，生产构建（GitHub Pages）用 /FC-AI/ 子路径
  const isBuild = command === 'build'
  return {
    plugins: [react()],
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5177,
      host: true,
      open: true
    }
  }
})
