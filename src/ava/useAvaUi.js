import { useContext } from 'react'
import { AvaUiContext } from './avaUiReactContext'

export function useAvaUi() {
  const context = useContext(AvaUiContext)

  if (!context) {
    throw new Error('useAvaUi must be used within an AvaUiProvider')
  }

  return context
}
