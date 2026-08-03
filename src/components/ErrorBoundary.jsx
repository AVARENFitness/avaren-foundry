import { Component } from 'react'
import {
  AlertTriangle,
  Home,
  RefreshCcw,
} from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, info) {
    console.error('AVAREN screen error:', error, info)
  }

  reset = () => {
    this.setState({
      hasError: false,
      error: null,
    })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <section className="avaren-error-state">
        <div className="avaren-error-icon">
          <AlertTriangle size={28} />
        </div>

        <span className="eyebrow">RECOVERY MODE</span>
        <h1>This screen hit an unexpected error.</h1>
        <p>
          Your saved training data is still protected. Reload
          the screen or return Home to continue.
        </p>

        <div className="avaren-error-actions">
          <button
            className="gold-button machined"
            onClick={this.reset}
          >
            <RefreshCcw size={17} />
            Reload Screen
          </button>

          <button
            className="avaren-secondary-button"
            onClick={() => {
              this.reset()
              this.props.onReturnHome?.()
            }}
          >
            <Home size={17} />
            Return Home
          </button>
        </div>

        {import.meta.env.DEV && this.state.error && (
          <pre className="avaren-error-detail">
            {String(
              this.state.error?.stack ??
                this.state.error?.message ??
                this.state.error,
            )}
          </pre>
        )}
      </section>
    )
  }
}
