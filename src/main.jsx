import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
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
      <AppUiProvider>
        <App />
      </AppUiProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
