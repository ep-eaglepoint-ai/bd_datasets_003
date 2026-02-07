import express from 'express'

import { createArticleRoutes } from '../../repository_after/src/routes/articles'
import { createCategoryRoutes } from '../../repository_after/src/routes/categories'
import { createUserRoutes } from '../../repository_after/src/routes/users'
import { createMetricsRoutes } from '../../repository_after/src/routes/metrics'

import { cacheMetrics } from '../../repository_after/src/cache/metrics'

export function makeApp() {
	const app = express()
	app.use(express.json())

	cacheMetrics.reset()

	app.use('/api/articles', createArticleRoutes())
	app.use('/api/categories', createCategoryRoutes())
	app.use('/api/users', createUserRoutes())
	app.use('/api/admin', createMetricsRoutes())

	app.get('/health', (req, res) => {
		res.json({ ok: true })
	})

	return app
}
