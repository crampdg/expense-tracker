import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error: null } }
  static getDerivedStateFromError(error){ return { error } }
  componentDidCatch(error, info){ console.error(error, info) }
  render(){
    if (this.state.error) {
      return (
        <div className="p-4">
          <h1 className="text-xl font-bold mb-2">Runtime error</h1>
          <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-3 rounded">
            {String(this.state.error.stack || this.state.error)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
