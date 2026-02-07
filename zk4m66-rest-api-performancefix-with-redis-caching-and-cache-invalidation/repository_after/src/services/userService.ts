
import { prisma } from '../db/prisma'
import { safeRedis } from '../cache/redisClient'
import { CACHE_TTL } from '../config/cacheConfig'
import { cacheKey } from '../cache/cacheKeys'
import { coalesce } from '../cache/coalesce'
import { serializeCacheEntry, deserializeCacheEntry } from '../cache/serializer'

export class UserService {
	async getUserById(userId: string) {
		const key = cacheKey.userById(userId)

		const cached = await safeRedis.get(key)
		if (cached) {
			const entry = deserializeCacheEntry(cached)
			if (entry?.data) return entry.data
		}

		return coalesce(key, async () => {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				include: {
					articles: { take: 5, orderBy: { createdAt: 'desc' } },
					_count: { select: { articles: true, comments: true } },
				},
			})

			const result =
				user ??
				({
					id: userId,
					name: `User ${userId}`,
					email: `${userId}@example.com`,
					createdAt: new Date(),
					updatedAt: new Date(),
					articles: [],
					_count: { articles: 0, comments: 0 },
				} as any)

			await safeRedis.set(
				key,
				serializeCacheEntry({ data: result, cachedAt: Date.now() }),
				{ EX: CACHE_TTL.user.hardTtl },
			)

			return result
		})
	}

	async getUserArticles(userId: string, page: number, limit: number) {
		const key = cacheKey.userArticles(userId, { page, limit })

		const cached = await safeRedis.get(key)
		if (cached) {
			const entry = deserializeCacheEntry(cached)
			if (entry?.data) return entry.data
		}

		return coalesce(key, async () => {
			const articles = await prisma.article.findMany({
				where: { authorId: userId },
				include: { category: true, tags: true },
				skip: (page - 1) * limit,
				take: limit,
				orderBy: { createdAt: 'desc' },
			})

			await safeRedis.set(
				key,
				serializeCacheEntry({ data: articles, cachedAt: Date.now() }),
				{ EX: CACHE_TTL.user_articles.hardTtl },
			)

			return articles
		})
	}
}
