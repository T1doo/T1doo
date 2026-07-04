import './assets/launcher.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LauncherApp from './launcher/LauncherApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LauncherApp />
  </StrictMode>
)
