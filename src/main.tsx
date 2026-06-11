import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted fonts (divergence from prototype's Google CDN) so type renders offline.
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/hanken-grotesk'

import './styles/global.css'
import './devtools'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
