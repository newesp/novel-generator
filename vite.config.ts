import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import https from 'node:https'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

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

          // 只在 client 明確提供 Authorization 時才轉發；
          // Google Gemini 用 URL query string 的 ?key=... 認證，多送 Authorization 會被誤判為 OAuth token。
          const forwardHeaders: Record<string, string | number> = {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          }
          const incomingAuth = req.headers['authorization']
          if (typeof incomingAuth === 'string' && incomingAuth.length > 0) {
            forwardHeaders.Authorization = incomingAuth
          }

          const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: forwardHeaders,
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

/**
 * promptLogPlugin
 * 攔截 POST /log-prompt，把瀏覽器送來的 prompt 寫入 temp/ 資料夾。
 * 僅供 dev 階段除錯/優化使用。
 *
 * Body: { filename: string, content: string }
 *  - filename 會被 sanitize，禁止 path traversal
 */
function promptLogPlugin(): Plugin {
  return {
    name: 'prompt-log',
    configureServer(server) {
      server.middlewares.use('/log-prompt', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405); res.end(); return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            const { filename, content } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (typeof filename !== 'string' || typeof content !== 'string') {
              res.writeHead(400); res.end('bad body'); return
            }
            // sanitize：只保留檔名本體，禁止子目錄
            const safe = path.basename(filename).replace(/[^\w.\-]/g, '_')
            const dir = path.resolve(process.cwd(), 'temp')
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            const full = path.join(dir, safe)
            fs.writeFileSync(full, content, 'utf8')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, path: `temp/${safe}` }))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: (err as Error).message }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), llmProxyPlugin(), promptLogPlugin()],
  server: {
    // 固定 port：避免 5173 被占用時自動跳 port，
    // 導致 IndexedDB origin 改變、舊資料看似「消失」。
    port: 5173,
    strictPort: true,
  },
})
