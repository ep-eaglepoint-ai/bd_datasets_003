import { Router } from 'express'
import { prisma } from '../db/prisma'

import { cacheMiddleware } from '../cache/cacheMiddleware'
import { invalidateList, invalidateResource } from '../cache/invalidate'

export function createCategoryRoutes() {
	const router = Router()

	router.get(
		'/',
		cacheMiddleware({
			resource: 'categories_list',
			fetcher: async () => {
				const categories = await prisma.category.findMany({
					include: {
						_count: {
							select: { articles: true },
						},
					},
					orderBy: { name: 'asc' },
				})

				return categories
			},
		}),
	)

	router.get(
		'/:id',
		cacheMiddleware({
			resource: 'category',
			idParam: 'id',
			fetcher: async (req) => {
				const category = await prisma.category.findUnique({
					where: { id: req.params.id },
					include: {
						articles: {
							take: 10,
							orderBy: { createdAt: 'desc' },
						},
						_count: {
							select: { articles: true },
						},
					},
				})

				if (!category) {
					throw new Error('Category not found')
				}

				return category
			},
		}),
	)

	router.post('/', async (req, res, next) => {
		try {
			const category = await prisma.category.create({
				data: req.body,
			})

			await invalidateList('categories_list')

			res.status(201).json(category)
		} catch (err) {
			next(err)
		}
	})

	router.put('/:id', async (req, res, next) => {
		try {
			const category = await prisma.category.update({
				where: { id: req.params.id },
				data: req.body,
			})

			await invalidateResource('category', req.params.id)
			await invalidateList('categories_list')

			res.json(category)
		} catch (err) {
			next(err)
		}
	})

	router.delete('/:id', async (req, res, next) => {
		try {
			await prisma.category.delete({
				where: { id: req.params.id },
			})

			await invalidateResource('category', req.params.id)
			await invalidateList('categories_list')

			res.status(204).send()
		} catch (err) {
			next(err)
		}
	})

	return router
}
