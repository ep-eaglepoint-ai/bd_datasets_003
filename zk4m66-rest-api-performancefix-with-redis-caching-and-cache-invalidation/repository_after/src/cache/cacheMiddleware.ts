
import type { Request, Response, NextFunction } from 'express'
import { safeRedis } from './redisClient'
import { CACHE_TTL, type ResourceName } from '../config/cacheConfig'
import { serializeCacheEntry, deserializeCacheEntry } from './serializer'
import { cacheKey } from './cacheKeys'
import { computeEtag } from './etag'
import { staleWhileRevalidate } from './staleWhileRevalidate'
import { cacheMetrics } from './metrics'

type CacheMiddlewareOptions = {
	resource: ResourceName
	idParam?: string
	fetcher: (req: Request) => Promise<any>
}

type StoredEntry = {
	data?: any
	cachedAt?: number
	etag?: string
}

function getPrefixKey(resource: ResourceName, req: Request, idParam?: string) {
	if (resource === 'articles_list') {
		const page = Number(req.query.page || 1)
		const limit = Number(req.query.limit || 20)
		const category = (req.query.category as string | undefined) || undefined
		const search = (req.query.search as string | undefined) || undefined
		return cacheKey.articlesList({ page, limit, category, search })
	}

	if (resource === 'article') {
		const id = req.params[idParam || 'id']
		return cacheKey.articleById(id)
	}

	if (resource === 'categories_list') return cacheKey.categoriesList()

	if (resource === 'category') {
		const id = req.params[idParam || 'id']
		return cacheKey.categoryById(id)
	}

	if (resource === 'user') {
		const id = req.params[idParam || 'id']
		return cacheKey.userById(id)
	}

	if (resource === 'user_articles') {
		const id = req.params[idParam || 'id']
		const page = Number(req.query.page || 1)
		const limit = Number(req.query.limit || 20)
		return cacheKey.userArticles(id, { page, limit })
	}

	if (resource === 'category_tree') return `category_tree:v1`
	if (resource === 'category_stats') return `category_stats:v1`
	if (resource === 'popular_articles') return `popular_articles:v1`

	return `${resource}:v1`
}

async function findAnyKeyByPrefix(prefixKey: string): Promise<string | null> {
	let cursor = '0'

	do {
		const [nextCursor, keys] = await safeRedis.scan(
			cursor,
			'MATCH',
			`${prefixKey}:*`,
			'COUNT',
			'50',
		)

		if (keys && keys.length > 0) return keys[0]
		cursor = nextCursor
	} while (cursor !== '0')

	return null
}

export function cacheMiddleware(opts: CacheMiddlewareOptions) {
	return async (req: Request, res: Response, next: NextFunction) => {
		const ttl = CACHE_TTL[opts.resource]
		const prefixKey = getPrefixKey(opts.resource, req, opts.idParam)
		const serveWithoutCache = async () => {
			try {
				const data = await opts.fetcher(req)
				if (!res.headersSent) res.json(data)
				return
			} catch (e) {
				return next(e)
			}
		}

		const started = Date.now()

		try {
			const foundKey = await findAnyKeyByPrefix(prefixKey)

			if (foundKey) {
				const raw = await safeRedis.get(foundKey)
				if (raw) {
					const entry = deserializeCacheEntry<StoredEntry>(raw)

					if (entry?.etag) {
						res.setHeader('ETag', entry.etag)
						if (req.headers['if-none-match'] === entry.etag) {
							cacheMetrics.recordHit(Date.now() - started)
							res.status(304).end()
							return
						}
					}

					if (entry?.data !== undefined) {
						cacheMetrics.recordHit(Date.now() - started)
						res.json(entry.data)

						const ageSeconds = Math.floor(
							(Date.now() - (entry.cachedAt || 0)) / 1000,
						)

						if (ageSeconds > ttl.softTtl) {
							void staleWhileRevalidate(async () => {
								try {
									const fresh = await opts.fetcher(req)
									const freshEtag = computeEtag(fresh)
									const freshKey = cacheKey.withEtag(
										prefixKey,
										freshEtag,
									)

									await safeRedis.set(
										freshKey,
										serializeCacheEntry({
											data: fresh,
											cachedAt: Date.now(),
											etag: freshEtag,
										}),
										{ EX: ttl.hardTtl },
									)

									cacheMetrics.recordSet()
								} catch {
									cacheMetrics.recordError()
								}
							})
						}

						return
					}
				}
			}

			const data = await opts.fetcher(req)
			const etag = computeEtag(data)
			const fullKey = cacheKey.withEtag(prefixKey, etag)

			res.setHeader('ETag', etag)

			cacheMetrics.recordMiss(Date.now() - started)

			try {
				await safeRedis.set(
					fullKey,
					serializeCacheEntry({
						data,
						cachedAt: Date.now(),
						etag,
					}),
					{ EX: ttl.hardTtl },
				)
				cacheMetrics.recordSet()
			} catch {
				cacheMetrics.recordError()
			}

			res.json(data)
		} catch (err) {
			cacheMetrics.recordError()
			return serveWithoutCache()
		}
	}
}
