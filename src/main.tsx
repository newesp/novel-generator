import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTheme, MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import './v2.css'
import App from './App.tsx'
// 載入 DB 診斷工具，dev 模式會掛到 window.dbDebug
import './lib/db-maintenance'
import { initAutoSync } from './lib/auto-sync'

// 啟動自動同步（會檢查是否有已連結的同步資料夾）
initAutoSync().catch((e) => console.warn('[auto-sync] init error:', e))

const theme = createTheme({
  primaryColor: 'gray',
  defaultRadius: 'sm',
  fontFamily: '"Microsoft JhengHei", "PingFang TC", system-ui, sans-serif',
  headings: {
    fontFamily: '"Microsoft JhengHei", "PingFang TC", system-ui, sans-serif',
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
)
