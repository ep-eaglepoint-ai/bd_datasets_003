
import { prisma } from '../db/prisma'
import { safeRedis } from '../cache/redisClient'
import { CACHE_TTL } from '../config/cacheConfig'
import { serializeCacheEntry, deserializeCacheEntry } from '../cache/serializer'
import { coalesce } from '../cache/coalesce'

export class ArticleService {
	async getPopularArticles(limit: number = 10) {
		const key = `popular_articles:limit:${limit}`

		const cached = await safeRedis.get(key)
		if (cached) {
			const entry = deserializeCacheEntry(cached)
			if (entry?.data) return entry.data
		}

		return coalesce(key, async () => {
			const articles = await prisma.article.findMany({
				orderBy: { viewCount: 'desc' },
				take: limit,
				include: { author: true, category: true },
			})

			await safeRedis.set(
				key,
				serializeCacheEntry({ data: articles, cachedAt: Date.now() }),
				{ EX: CACHE_TTL.popular_articles.hardTtl },
			)

			return articles
		})
	}

	async getArticlesByTag(
		tagId: string,
		page: number = 1,
		limit: number = 20,
	) {
		const key = `articles_by_tag:${tagId}:page:${page}:limit:${limit}`

		const cached = await safeRedis.get(key)
		if (cached) {
			const entry = deserializeCacheEntry(cached)
			if (entry?.data) return entry.data
		}

		return coalesce(key, async () => {
			const articles = await prisma.article.findMany({
				where: { tags: { some: { id: tagId } } },
				include: { author: true, category: true, tags: true },
				skip: (page - 1) * limit,
				take: limit,
				orderBy: { createdAt: 'desc' },
			})

			await safeRedis.set(
				key,
				serializeCacheEntry({ data: articles, cachedAt: Date.now() }),
				{ EX: CACHE_TTL.articles_list.hardTtl },
			)

			return articles
		})
	}

	async getRelatedArticles(articleId: string, limit: number = 5) {
		const key = `related_articles:${articleId}:limit:${limit}`

		const cached = await safeRedis.get(key)
		if (cached) {
			const entry = deserializeCacheEntry(cached)
			if (entry?.data) return entry.data
		}

		return coalesce(key, async () => {
			const article = await prisma.article.findUnique({
				where: { id: articleId },
				include: { tags: true },
			})

			if (!article) {
				await safeRedis.set(
					key,
					serializeCacheEntry({ data: [], cachedAt: Date.now() }),
					{ EX: CACHE_TTL.popular_articles.softTtl },
				)
				return []
			}

			const tagIds = article.tags.map((t) => t.id)
			if (tagIds.length === 0) {
				await safeRedis.set(
					key,
					serializeCacheEntry({ data: [], cachedAt: Date.now() }),
					{ EX: CACHE_TTL.popular_articles.softTtl },
				)
				return []
			}

			const related = await prisma.article.findMany({
				where: {
					id: { not: articleId },
					tags: { some: { id: { in: tagIds } } },
				},
				take: limit,
				orderBy: { viewCount: 'desc' },
				include: { author: true, category: true, tags: true },
			})

			await safeRedis.set(
				key,
				serializeCacheEntry({ data: related, cachedAt: Date.now() }),
				{ EX: CACHE_TTL.popular_articles.hardTtl },
			)

			return related
		})
	}
}
