import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { PasscodeGate } from './components/PasscodeGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PasscodeGate>
      <App />
    </PasscodeGate>
  </StrictMode>,
)

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed, app still works without it
    });
  });
}
