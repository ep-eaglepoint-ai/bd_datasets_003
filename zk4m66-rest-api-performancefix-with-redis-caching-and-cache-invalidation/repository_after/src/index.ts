import express from 'express'

import { createArticleRoutes } from './routes/articles'
import { createCategoryRoutes } from './routes/categories'
import { createUserRoutes } from './routes/users'
import { createMetricsRoutes } from './routes/metrics'

import { warmupCache } from './cache/warmup'

const app = express()

app.use(express.json())

app.use('/api/articles', createArticleRoutes())
app.use('/api/categories', createCategoryRoutes())
app.use('/api/users', createUserRoutes())
app.use('/api/admin', createMetricsRoutes())

app.get('/health', (req, res) => {
	res.json({ ok: true })
})

app.use(
	(
		err: any,
		req: express.Request,
		res: express.Response,
		_next: express.NextFunction,
	) => {
		const msg =
			typeof err?.message === 'string' ? err.message : 'Internal error'

		if (msg.toLowerCase().includes('not found')) {
			return res.status(404).json({ error: msg })
		}

		res.status(500).json({ error: msg })
	},
)

const port = Number(process.env.PORT || 3000)

app.listen(port, () => {
	console.log(`Server running on port ${port}`)

	warmupCache().catch((e) => {
		console.warn('Cache warmup failed:', e?.message || e)
	})
})

export { app }
