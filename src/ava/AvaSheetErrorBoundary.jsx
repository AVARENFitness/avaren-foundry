import { Component } from 'react'
import AppUiCloseButton from '../components/ui/AppUiCloseButton'
import { resetDocumentModalLayer } from '../hooks/useAppModalLayer'

export default class AvaSheetErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    if (import.meta.env?.DEV) {
      console.error('[AVA sheet error]', error, info?.componentStack)
    }
    resetDocumentModalLayer()
    this.props.onFatalError?.(error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="ava-sheet-backdrop app-ui-backdrop"
          role="presentation"
          data-app-ui-backdrop="open"
          onClick={this.props.onClose}
        >
          <section
            className="ava-sheet ava-sheet--conversation"
            role="dialog"
            aria-modal="true"
            aria-label="Ask AVA"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ava-sheet-header">
              <div className="ava-sheet-title">
                <span className="eyebrow">AVA</span>
                <h2>Ask AVA</h2>
              </div>
              <AppUiCloseButton onClick={this.props.onClose} label="Close AVA" />
            </header>
            <p className="ava-sheet-context">
              AVA hit an unexpected error. Close and try again.
            </p>
          </section>
        </div>
      )
    }

    return this.props.children
  }
}
