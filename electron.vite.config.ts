import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          // 主窗口 + F3 启动器独立小入口（启动器不背主应用的包）
          index: resolve('src/renderer/index.html'),
          launcher: resolve('src/renderer/launcher.html')
        }
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
