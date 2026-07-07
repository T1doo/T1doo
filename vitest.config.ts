import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Electron ABI 坑（§14.2）：postinstall 把 better-sqlite3 重建为 Electron ABI，
      // vitest 跑在系统 Node 下加载即崩。测试改走 Node ABI 别名副本
      // （版本刻意与主依赖错开，避免 pnpm store 去重共享同一物理目录被 rebuild 波及）。
      'better-sqlite3': 'better-sqlite3-node'
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
