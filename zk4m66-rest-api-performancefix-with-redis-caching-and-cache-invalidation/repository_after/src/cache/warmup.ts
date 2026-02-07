import { prisma } from '../db/prisma'
import { safeRedis } from './redisClient'
import { CACHE_TTL } from '../config/cacheConfig'
import { serializeCacheEntry } from './serializer'
import { cacheMetrics } from './metrics'

type WarmTask = {
	name: string
	key: string
	ttlSeconds: number
	run: () => Promise<unknown>
}

export async function warmupCache(): Promise<void> {
	const tasks: WarmTask[] = [
		{
			name: 'categories_list',
			key: 'categories_list:warm:v1',
			ttlSeconds: CACHE_TTL.categories_list.hardTtl,
			run: async () => {
				return prisma.category.findMany({
					include: { _count: { select: { articles: true } } },
					orderBy: { name: 'asc' },
				})
			},
		},
		{
			name: 'articles_list:page1',
			key: 'articles_list:warm:page:1:limit:20',
			ttlSeconds: CACHE_TTL.articles_list.hardTtl,
			run: async () => {
				const page = 1
				const limit = 20

				const articles = await prisma.article.findMany({
					include: { author: true, category: true, tags: true },
					skip: (page - 1) * limit,
					take: limit,
					orderBy: { createdAt: 'desc' },
				})

				const total = await prisma.article.count()

				return { articles, total, page, limit }
			},
		},
		{
			name: 'popular_articles',
			key: 'popular_articles:warm:limit:10',
			ttlSeconds: CACHE_TTL.popular_articles.hardTtl,
			run: async () => {
				return prisma.article.findMany({
					orderBy: { viewCount: 'desc' },
					take: 10,
					include: { author: true, category: true },
				})
			},
		},
	]

	for (const task of tasks) {
		try {
			const cached = await safeRedis.get(task.key)
			if (cached) continue

			const data = await task.run()

			await safeRedis.set(
				task.key,
				serializeCacheEntry({ data, cachedAt: Date.now() }),
				{ EX: task.ttlSeconds },
			)

			cacheMetrics.recordWarm()
		} catch (e) {
			// eslint-disable-next-line no-console
			console.warn(`[warmup] failed: ${task.name}`, e)
		}
	}
}
