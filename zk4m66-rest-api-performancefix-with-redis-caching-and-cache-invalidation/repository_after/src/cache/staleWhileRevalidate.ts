import { safeRedis } from './redisClient'
import { CACHE_TTL, type ResourceName } from '../config/cacheConfig'
import { serializeCacheEntry } from './serializer'
import { cacheMetrics } from './metrics'


export async function staleWhileRevalidate(
	task: () => Promise<void>,
): Promise<void> {
	try {
		await task()
	} catch (err) {
		// eslint-disable-next-line no-console
		console.warn('[cache] background refresh failed:', err)
	}
}


export async function refreshInBackground<T>(
	key: string,
	resource: ResourceName,
	fetcher: () => Promise<T>,
): Promise<void> {
	try {
		const freshData = await fetcher()

		const entry = {
			data: freshData,
			cachedAt: Date.now(),
		}

		const ttl = CACHE_TTL[resource].hardTtl

		await safeRedis.set(key, serializeCacheEntry(entry), 'EX', ttl)
		cacheMetrics.recordSet()
	} catch (err) {
		cacheMetrics.recordError()
		// eslint-disable-next-line no-console
		console.warn('[cache] background refresh failed:', err)
	}
}
