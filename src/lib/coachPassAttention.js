export const LOW_PASS_ATTENTION_THRESHOLD = 2

export const isLowPassBalance = (balance, { threshold = LOW_PASS_ATTENTION_THRESHOLD } = {}) => {
  const value = Number(balance ?? 0)
  return value >= 0 && value <= threshold
}
