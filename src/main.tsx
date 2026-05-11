import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// 載入 DB 診斷工具，dev 模式會掛到 window.dbDebug
import './lib/db-maintenance'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
