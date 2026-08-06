import { Sparkles } from 'lucide-react'

export default function AvaEntryButton({ onOpen }) {
  return (
    <button
      type="button"
      className="ava-entry-button"
      onClick={onOpen}
      aria-label="Ask AVA"
    >
      <Sparkles size={17} strokeWidth={1.8} />
      <span>Ask AVA</span>
    </button>
  )
}
