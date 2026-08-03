export default function Stepper({ value, step, onChange, inputMode = 'numeric' }) {
  const numeric = Number(value || 0)
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(0, numeric - step))}>−</button>
      <input
        inputMode={inputMode}
        value={value}
        onFocus={(event) => event.target.select()}
        onClick={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value)}
      />
      <button onClick={() => onChange(numeric + step)}>+</button>
    </div>
  )
}
