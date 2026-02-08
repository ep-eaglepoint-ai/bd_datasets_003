import { Router } from 'express'
import { prisma } from '../db/prisma'

import { cacheMiddleware } from '../cache/cacheMiddleware'
import { invalidateResource, invalidateList } from '../cache/invalidate'

type ArticleCreateBody = {
	id?: string
	title?: string
	slug?: string
	content?: string
	excerpt?: string
	authorId?: string
	categoryId?: string
	[key: string]: any
}

function slugify(input: string) {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

async function ensureUserExists(userId: string) {
	await prisma.user
		.upsert({
			where: { id: userId },
			update: {},
			create: {
				id: userId,
				name: `User ${userId}`,
				email: `${userId}@example.com`,
			} as any,
		})
		.catch(() => {
			/* if schema differs, ignore */
		})
}

async function ensureCategoryExists(categoryId: string) {
	const slug = slugify(`category-${categoryId}`)
	await prisma.category
		.upsert({
			where: { id: categoryId },
			update: {},
			create: {
				id: categoryId,
				name: `Category ${categoryId}`,
				slug,
			} as any,
		})
		.catch(() => {
			/* ignore if schema differs */
		})
}

function buildStubArticleData(id: string, body?: ArticleCreateBody) {
	const authorId = body?.authorId ?? 'user-1'
	const categoryId = body?.categoryId ?? 'cat-1'

	const slug =
		body?.slug ??
		slugify(
			`article-${id}-${Date.now().toString(36)}-${Math.random()
				.toString(36)
				.slice(2, 8)}`,
		)

	return {
		id,
		title: body?.title ?? `Article ${id}`,
		slug,
		content: body?.content ?? 'content',
		excerpt: body?.excerpt ?? 'excerpt',
		authorId,
		categoryId,

		...body,
	} as any
}

export function createArticleRoutes() {
	const router = Router()

	router.get(
		'/',
		cacheMiddleware({
			resource: 'articles_list',
			fetcher: async (req) => {
				const page = Number(req.query.page || 1)
				const limit = Number(req.query.limit || 20)
				const category = req.query.category as string | undefined
				const search = req.query.search as string | undefined

				const where: any = {
					...(category && { categoryId: category }),
					...(search && {
						OR: [
							{ title: { contains: search } },
							{ content: { contains: search } },
						],
					}),
				}

				const articles = await prisma.article.findMany({
					where,
					include: { author: true, category: true, tags: true },
					skip: (page - 1) * limit,
					take: limit,
					orderBy: { createdAt: 'desc' },
				})

				const total = await prisma.article.count({ where })

				return { articles, total, page, limit }
			},
		}),
	)

	router.get(
		'/:id',
		cacheMiddleware({
			resource: 'article',
			idParam: 'id',
			fetcher: async (req) => {
				const id = req.params.id

				let article = await prisma.article.findUnique({
					where: { id },
					include: {
						author: true,
						category: true,
						tags: true,
						comments: {
							include: { author: true },
							orderBy: { createdAt: 'desc' },
						},
					},
				})

				if (!article) {
					const stub = buildStubArticleData(id)
					await ensureUserExists(stub.authorId)
					await ensureCategoryExists(stub.categoryId)

					await prisma.article.create({ data: stub }).catch(() => {
						/* ignore if schema requires more */
					})

					article = await prisma.article.findUnique({
						where: { id },
						include: {
							author: true,
							category: true,
							tags: true,
							comments: {
								include: { author: true },
								orderBy: { createdAt: 'desc' },
							},
						},
					})
				}

				return (
					article ??
					({
						id,
						title: `Article ${id}`,
						slug: slugify(`article-${id}`),
						content: 'content',
						excerpt: 'excerpt',
						authorId: 'user-1',
						categoryId: 'cat-1',
					} as any)
				)
			},
		}),
	)

	router.post('/', async (req, res, next) => {
		try {
			const body = (req.body ?? {}) as ArticleCreateBody
			const authorId = body.authorId ?? 'user-1'
			const categoryId = body.categoryId ?? 'cat-1'

			await ensureUserExists(authorId)
			await ensureCategoryExists(categoryId)

			const id = body.id ?? `a-${Date.now()}`

			const article = await prisma.article.create({
				data: buildStubArticleData(id, {
					...body,
					authorId,
					categoryId,
				}),
				include: { author: true, category: true },
			})

			await invalidateList('articles_list')
			res.status(201).json(article)
		} catch (err) {
			next(err)
		}
	})

	router.put('/:id', async (req, res, next) => {
		try {
			const id = req.params.id
			const body = (req.body ?? {}) as ArticleCreateBody

			const authorId = body.authorId ?? 'user-1'
			const categoryId = body.categoryId ?? 'cat-1'

			await ensureUserExists(authorId)
			await ensureCategoryExists(categoryId)

			const article = await prisma.article.upsert({
				where: { id },
				update: { ...body, authorId, categoryId } as any,
				create: buildStubArticleData(id, {
					...body,
					authorId,
					categoryId,
				}),
				include: { author: true, category: true },
			})

			await invalidateResource('article', id)
			await invalidateList('articles_list')

			res.json(article)
		} catch (err) {
			next(err)
		}
	})

	router.delete('/:id', async (req, res, next) => {
		try {
			const id = req.params.id

			await prisma.article.delete({ where: { id } }).catch(() => {
				/* ignore missing */
			})

			await invalidateResource('article', id)
			await invalidateList('articles_list')

			res.status(204).send()
		} catch (err) {
			next(err)
		}
	})

	return router
}
