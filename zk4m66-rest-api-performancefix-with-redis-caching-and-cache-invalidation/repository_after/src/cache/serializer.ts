
export type CacheEntry<T> = {
	data: T
	cachedAt: number
	etag?: string
}

const DATE_TAG = '__$date$__'

function encodeDates(value: any): any {
	if (value instanceof Date) {
		return { [DATE_TAG]: value.toISOString() }
	}

	if (!value || typeof value !== 'object') return value

	if (Array.isArray(value)) return value.map(encodeDates)

	const out: Record<string, any> = {}
	for (const [k, v] of Object.entries(value)) out[k] = encodeDates(v)
	return out
}

function reviveDates(value: any): any {
	if (!value || typeof value !== 'object') return value

	if (Array.isArray(value)) return value.map(reviveDates)

	if (DATE_TAG in value && typeof (value as any)[DATE_TAG] === 'string') {
		return new Date((value as any)[DATE_TAG])
	}

	for (const [k, v] of Object.entries(value)) {
		;(value as any)[k] = reviveDates(v)
	}
	return value
}

export function serializeCacheEntry(data: any): string {
	return JSON.stringify(encodeDates(data))
}

export function deserializeCacheEntry<T = any>(raw: string | null): T | null {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw)
		return reviveDates(parsed) as T
	} catch {
		return null
	}
}
