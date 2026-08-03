import { Upload } from 'lucide-react'
import { useRef } from 'react'

export default function ImportBackupButton({ onImport }) {
  const inputRef = useRef(null)

  return (
    <>
      <button className="setting-row" onClick={() => inputRef.current?.click()}>
        <Upload /> Import backup <span>›</span>
      </button>
      <input
        ref={inputRef}
        className="hidden-file-input"
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onImport(file)
          event.target.value = ''
        }}
      />
    </>
  )
}
