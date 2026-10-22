import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { ErrorBoundary } from './error-boundary.tsx'
import { startUpdates } from './features/update'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// The service worker: a new build waits until a grown-up taps Update now (src/features/update).
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) startUpdates(registration)
  },
})
