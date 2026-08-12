import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AvaProvider } from './ava/AvaContext'
import AppUiProvider from './components/ui/AppUiProvider'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'
import './styles/screens/builder.css'
import './styles/screens/forge.css'
import './styles/screens/history.css'
import './styles/screens/coach-hub.css'
import './styles/screens/coach-schedule.css'
import './styles/components/app-ui.css'
import './styles/screens/athlete-appointments.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary
      boundary="root"
      onReturnHome={() => {
        window.location.assign(window.location.pathname)
      }}
    >
      <AvaProvider>
        <AppUiProvider>
          <App />
        </AppUiProvider>
      </AvaProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
