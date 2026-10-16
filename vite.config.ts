import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import http from 'http'
import https from 'https'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // 开发环境用根路径，生产构建（GitHub Pages）用 /FC-AI/ 子路径
  const isBuild = command === 'build'
  return {
    plugins: [
      react(),
      // 开发环境 CORS 代理：前端把外部 API 请求改写为 /__proxy?target=<真实URL>，
      // 由本中间件在服务端转发，绕开浏览器的同源限制（解决「扣费成功但图回不来」的 CORS 拦响应问题）。
      // 仅对 dev server 生效；生产需改用支持 CORS 的通道或真正的服务端代理。
      {
        name: 'dev-cors-proxy',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const rawUrl = (req as any).url || ''
            const m = rawUrl.match(/^\/__proxy\?target=([^&]+)(?:&path=([^&]*))?/)
            if (!m) return next()

            const mod = /^https:/i.test(m[1]) ? https : http
            const target = new URL(decodeURIComponent(m[1]))
            const pathExtra = m[2] ? decodeURIComponent(m[2]) : ''
            const headers = { ...req.headers, host: target.host }
            // 去掉代理自身可能带入的 host/内容头干扰
            delete (headers as any).origin

            // 预检
            if (req.method === 'OPTIONS') {
              res.writeHead(204, {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
                'access-control-allow-headers': (req.headers['access-control-request-headers'] as string) || '*',
                'access-control-max-age': '86400',
              })
              res.end()
              return
            }

            const options = {
              hostname: target.hostname,
              port: target.port || (target.protocol === 'https:' ? 443 : 80),
              path: target.pathname + target.search + pathExtra,
              method: req.method,
              headers,
            }

            const proxyReq = mod.request(options, (proxyRes: any) => {
              res.writeHead(proxyRes.statusCode || 502, {
                ...proxyRes.headers,
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
                'access-control-allow-headers': (req.headers['access-control-request-headers'] as string) || '*',
              })
              proxyRes.pipe(res)
            })
            proxyReq.on('error', (e: Error) => {
              if (!res.headersSent) {
                res.writeHead(502, { 'content-type': 'application/json' })
                res.end(JSON.stringify({ error: { message: `proxy error: ${e.message}`, code: 'proxy_error' } }))
              } else {
                res.end()
              }
            })
            req.pipe(proxyReq)
          })
        },
      },
    ],
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5177,
      host: true,
      open: true,
    },
  }
})
