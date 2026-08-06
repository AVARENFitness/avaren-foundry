import { AVA_INTENT_LABELS } from './intents'

const formatEstimate = (label, value, suffix = '') => {
  if (value == null || value === '') return null
  return {
    label,
    value: `${value}${suffix}`,
  }
}

export function buildConfirmationPreview(response) {
  if (!response?.ok) return null

  const intent = response.routedIntent ?? response.intent
  const data = response.data ?? {}

  if (intent === 'food' && data.estimated) {
    const { estimated, description } = data
    return {
      title: 'Log this meal?',
      confidenceLabel: 'Preview · not saved',
      items: description
        ? [{ label: 'Description', value: description }]
        : [],
      estimates: [
        formatEstimate('Calories', estimated.calories),
        formatEstimate('Protein', estimated.protein, 'g'),
        formatEstimate('Carbs', estimated.carbs, 'g'),
        formatEstimate('Fat', estimated.fat, 'g'),
      ].filter(Boolean),
    }
  }

  if (intent === 'water') {
    return {
      title: 'Log hydration?',
      confidenceLabel: 'Preview · not saved',
      items: [
        {
          label: 'Amount',
          value: data.waterOz ? `${data.waterOz} oz` : 'One serving',
        },
      ],
      estimates: data.goalOz
        ? [formatEstimate('Daily goal', data.goalOz, ' oz')].filter(Boolean)
        : [],
    }
  }

  if (intent === 'weight') {
    return {
      title: 'Log body weight?',
      confidenceLabel: 'Preview · not saved',
      items: [
        {
          label: 'Weight',
          value: data.value ? String(data.value) : 'Pending confirmation',
        },
      ],
      estimates: data.trend
        ? [{ label: 'Trend', value: String(data.trend) }]
        : [],
    }
  }

  if (intent === 'workout') {
    return {
      title: 'Apply workout guidance?',
      confidenceLabel: AVA_INTENT_LABELS.workout,
      items: [
        {
          label: 'Focus',
          value: data.focus ?? 'Today',
        },
        {
          label: 'Recommendation',
          value: data.recommendation?.action ?? 'Review',
        },
      ],
      estimates: data.recommendation?.confidence
        ? [
            {
              label: 'Confidence',
              value: `${Math.round(data.recommendation.confidence * 100)}%`,
            },
          ]
        : [],
    }
  }

  return null
}
