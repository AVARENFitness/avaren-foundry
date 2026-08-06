import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AvaProvider } from './ava/AvaContext'
import AppUiProvider from './components/ui/AppUiProvider'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'

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
