import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { ThemeProvider } from './context/ThemeContext'
import { LocalizedClerkProvider } from './context/LocalizedClerkProvider'
import { ToastProvider } from './context/ToastContext'
import JobsWatcher from './components/JobsWatcher'
import CookReminderBanner from './components/CookReminderBanner'
import './index.css'
import App from './App.tsx'

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error('Add VITE_CLERK_PUBLISHABLE_KEY to the environment')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ThemeProvider>
        <LanguageProvider>
          <LocalizedClerkProvider>
            <ToastProvider>
              <JobsWatcher />
              <CookReminderBanner />
              <App />
            </ToastProvider>
          </LocalizedClerkProvider>
        </LanguageProvider>
      </ThemeProvider>
    </HashRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA install support is best-effort */ })
  })
}
