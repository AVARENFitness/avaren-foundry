import { useContext } from 'react'
import { AvaContext } from './AvaContext'

export function useAva() {
  const context = useContext(AvaContext)

  if (!context) {
    throw new Error('useAva must be used within an AvaProvider')
  }

  return context
}
