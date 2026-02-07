import { DateTime } from 'luxon'

type NormalizeOptions = {
  fallback?: string
  label?: string
}

export const isValidTimezone = (tz: string | null | undefined) => {
  if (!tz || typeof tz !== 'string') return false
  const trimmed = tz.trim()
  if (!trimmed) return false
  return DateTime.local().setZone(trimmed).isValid
}

export const normalizeTimezone = (
  tz: string | null | undefined,
  options: NormalizeOptions = {}
) => {
  const label = options.label ? `${options.label}: ` : ''
  if (isValidTimezone(tz)) {
    return (tz as string).trim()
  }
  if (options.fallback) return options.fallback
  throw new Error(`${label}Invalid timezone`)
}
