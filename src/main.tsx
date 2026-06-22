import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { SyncProvider } from './components/SyncProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SyncProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </SyncProvider>
  </StrictMode>,
)
