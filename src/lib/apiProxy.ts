// 开发环境 CORS 代理改写：把外部 API URL 改写为同源 /__proxy 路径，
// 由 vite dev server 中间件转发，绕开浏览器同源限制。
// 生产构建（import.meta.env.PROD）不启用，保持直连（需 API 支持 CORS 或服务端代理）。
export function apiProxyUrl(url: string): string {
  if (typeof url !== 'string' || url.length === 0) return url
  if (import.meta.env.DEV && /^https?:\/\//i.test(url)) {
    return `/__proxy?target=${encodeURIComponent(url)}`
  }
  return url
}
