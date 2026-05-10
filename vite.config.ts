import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import https from 'node:https'
import http from 'node:http'

/**
 * llmProxyPlugin
 * 攔截 POST /llm-proxy 請求，由 Node server 端轉發至外部 LLM API。
 * 解決瀏覽器直接呼叫外部 API 的 CORS 限制。
 *
 * llm.ts 會在 headers 中傳入：
 *   x-proxy-target  : 完整的目標 URL（e.g. https://integrate.api.nvidia.com/v1/chat/completions）
 *   authorization   : Bearer <apiKey>
 */
function llmProxyPlugin(): Plugin {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/llm-proxy', (req, res) => {
        const targetUrl = req.headers['x-proxy-target'] as string | undefined

        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing x-proxy-target header' }))
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          const body = Buffer.concat(chunks)
          const url = new URL(targetUrl)
          const isHttps = url.protocol === 'https:'
          const lib = isHttps ? https : http

          const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': body.length,
              Authorization: req.headers['authorization'] ?? '',
            },
          }

          const proxyReq = lib.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 200, {
              'Content-Type': proxyRes.headers['content-type'] ?? 'application/json',
              'Access-Control-Allow-Origin': '*',
            })
            proxyRes.pipe(res, { end: true })
          })

          proxyReq.on('error', (err) => {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          })

          proxyReq.write(body)
          proxyReq.end()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), llmProxyPlugin()],
})
