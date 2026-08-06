import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AppUiProvider from './components/ui/AppUiProvider'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppUiProvider>
      <App />
    </AppUiProvider>
  </React.StrictMode>,
)
