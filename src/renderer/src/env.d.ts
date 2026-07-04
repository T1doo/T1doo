/// <reference types="vite/client" />

import type { T1dooApi } from '@shared/api'

declare global {
  interface Window {
    t1doo: T1dooApi
  }
}

export {}
