import { useState, useEffect } from 'react'
import './App.css'

// App state types
type AppState = 'loading' | 'error' | 'ready'

function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [backendStatus, setBackendStatus] = useState<string>('')

  useEffect(() => {
    // Check backend health on mount
    const checkBackend = async () => {
      console.log('🔍 Checking backend health...')
      try {
        const response = await fetch('/api/health')
        if (response.ok) {
          const data = await response.json()
          console.log('✅ Backend healthy:', data)
          setBackendStatus('✅')
          setAppState('ready')
        } else {
          console.error('❌ Backend unhealthy:', response.status)
          setBackendStatus('❌')
          setAppState('error')
        }
      } catch (error) {
        console.error('❌ Backend connection failed:', error)
        setBackendStatus('❌')
        setAppState('error')
      }
    }

    checkBackend()
  }, [])

  // Loading state - pulsing location pin
  if (appState === 'loading') {
    return (
      <div className="app-container">
        <div className="loading-indicator">
          <span className="pulse">📍</span>
        </div>
      </div>
    )
  }

  // Error state
  if (appState === 'error') {
    return (
      <div className="app-container">
        <div className="error-container">
          <span className="error-icon">🌐❌</span>
          <button
            className="retry-button"
            onClick={() => window.location.reload()}
            aria-label="Retry"
          >
            🔄
          </button>
        </div>
      </div>
    )
  }

  // Ready state - show placeholder for now
  return (
    <div className="app-container">
      <div className="status-indicator">
        <span className="brand">Ⓜ️🍩🌶️📍♑️🔺✌️</span>
        <span className="backend-status">{backendStatus}</span>
      </div>
      <div className="ready-message">
        <span>🎉</span>
      </div>
    </div>
  )
}

export default App
