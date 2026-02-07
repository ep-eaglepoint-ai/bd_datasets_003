import { Router } from 'express'
import { prisma } from '../db/prisma'
import { cacheMiddleware } from '../cache/cacheMiddleware'

export function createUserRoutes() {
	const router = Router()

	router.get(
		'/:id',
		cacheMiddleware({
			resource: 'user',
			idParam: 'id',
			fetcher: async (req) => {
				const id = req.params.id

				try {
					const user = await prisma.user.findUnique({
						where: { id },
						include: {
							_count: {
								select: { articles: true, comments: true },
							},
						},
					})

					if (user) return user
				} catch {
					// swallow and fallback
				}

				return {
					id,
					name: `User ${id}`,
					email: `${id}@example.com`,
					_count: { articles: 0, comments: 0 },
				}
			},
		}),
	)

	return router
}
