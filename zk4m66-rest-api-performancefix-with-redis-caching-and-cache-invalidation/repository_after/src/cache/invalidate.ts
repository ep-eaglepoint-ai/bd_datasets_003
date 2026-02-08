import { safeRedis } from './redisClient'

async function listKeys(pattern: string): Promise<string[]> {
	if (typeof safeRedis.keys === 'function') {
		try {
			return await safeRedis.keys(pattern)
		} catch {
			// fallback to scan
		}
	}

	const out: string[] = []
	let cursor = '0'
	do {
		const [nextCursor, batch] = await safeRedis.scan(
			cursor,
			'MATCH',
			pattern,
			'COUNT',
			'200',
		)
		out.push(...batch)
		cursor = nextCursor
	} while (cursor !== '0')

	return out
}

export async function invalidatePattern(pattern: string) {
	const keys = await listKeys(pattern)
	if (keys.length) await safeRedis.del(...keys)
}

export async function invalidateList(resource: string) {
	await invalidatePattern(`${resource}:*`)
}

export async function invalidateResource(resource: string, id: string) {
	await invalidatePattern(`${resource}:${id}:*`)
}
