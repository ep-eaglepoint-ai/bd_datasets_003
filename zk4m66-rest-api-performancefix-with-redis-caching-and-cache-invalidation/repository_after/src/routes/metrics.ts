import { Router } from 'express'
import { cacheMetrics } from '../cache/metrics'

export function createMetricsRoutes() {
	const router = Router()
	router.get('/cache-metrics', (req, res) => {
		res.json(cacheMetrics.snapshot())
	})

	return router
}
