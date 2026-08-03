import { Check, Cloud, CloudOff, LoaderCircle } from 'lucide-react'

export default function CloudStatus({ status }) {
  const config = {
    syncing: { icon: LoaderCircle, text: 'Syncing', className: 'syncing' },
    synced: { icon: Check, text: 'Cloud synced', className: 'synced' },
    offline: { icon: CloudOff, text: 'Saved locally', className: 'offline' },
    error: { icon: CloudOff, text: 'Sync needs attention', className: 'error' },
  }[status] ?? { icon: Cloud, text: 'Cloud ready', className: 'ready' }

  const Icon = config.icon

  return (
    <div className={`cloud-status ${config.className}`}>
      <Icon size={14} />
      <span>{config.text}</span>
    </div>
  )
}
