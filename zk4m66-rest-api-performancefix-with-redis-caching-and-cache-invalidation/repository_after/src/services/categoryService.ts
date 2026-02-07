
import { prisma } from '../db/prisma'
import { safeRedis } from '../cache/redisClient'
import { CACHE_TTL } from '../config/cacheConfig'
import { serializeCacheEntry, deserializeCacheEntry } from '../cache/serializer'
import { coalesce } from '../cache/coalesce'

export class CategoryService {
	async getCategoryStats() {
		const key = `category_stats:v1`

		const cached = await safeRedis.get(key)
		if (cached) {
			const entry = deserializeCacheEntry(cached)
			if (entry?.data) return entry.data
		}

		return coalesce(key, async () => {
			const categories = await prisma.category.findMany({
				include: { _count: { select: { articles: true } } },
				orderBy: { name: 'asc' },
			})

			const stats = await Promise.all(
				categories.map(async (category) => {
					const totalViews = await prisma.article.aggregate({
						where: { categoryId: category.id },
						_sum: { viewCount: true },
					})

					return {
						...category,
						totalViews: totalViews._sum.viewCount || 0,
					}
				}),
			)

			await safeRedis.set(
				key,
				serializeCacheEntry({ data: stats, cachedAt: Date.now() }),
				{ EX: CACHE_TTL.category_stats.hardTtl },
			)

			return stats
		})
	}

	async getCategoryTree() {
		const key = `category_tree:v1`

		const cached = await safeRedis.get(key)
		if (cached) {
			const entry = deserializeCacheEntry(cached)
			if (entry?.data) return entry.data
		}

		return coalesce(key, async () => {
			const categories = await prisma.category.findMany({
				where: { parentId: null },
				include: { children: { include: { children: true } } },
				orderBy: { name: 'asc' },
			})

			await safeRedis.set(
				key,
				serializeCacheEntry({ data: categories, cachedAt: Date.now() }),
				{ EX: CACHE_TTL.category_tree.hardTtl },
			)

			return categories
		})
	}
}
