import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { SyncProvider } from './components/SyncProvider.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SyncProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </SyncProvider>
    </ErrorBoundary>
  </StrictMode>,
)
