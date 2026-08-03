import { ChevronRight, Sunrise, Wind } from 'lucide-react'

export default function MobilityPrompt({ type, title, subtitle, detail, onOpen }) {
  const Icon = type === 'recovery' ? Wind : Sunrise

  return (
    <button className={`mobility-prompt ${type}`} onClick={onOpen}>
      <div className="mobility-prompt-icon"><Icon size={20} /></div>
      <div>
        <span>{subtitle}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <ChevronRight size={19} />
    </button>
  )
}
