import request from 'supertest'
import { describe, it, expect, beforeEach } from '@jest/globals'

import { makeApp } from '../helpers/makeApp'
import { FakeRedis } from '../helpers/fakeRedis'

function targetRepoBase(): string {
	return (global as any).__TARGET_REPO__ || '/app/repository_after'
}

describe('metrics endpoint', () => {
	let app: any
	let fakeRedis: FakeRedis

	beforeEach(async () => {
		fakeRedis = new FakeRedis()

		const redisClientModule = await import(
			`${targetRepoBase()}/src/cache/redisClient`
		)

		redisClientModule.__setSafeRedisForTests(fakeRedis as any)

		app = makeApp()
	})

	it('returns metrics structure', async () => {
		const res = await request(app)
			.get('/api/admin/cache-metrics')
			.expect(200)

		expect(res.body).toHaveProperty('hits')
		expect(res.body).toHaveProperty('misses')
		expect(res.body).toHaveProperty('sets')
		expect(res.body).toHaveProperty('errors')
		expect(res.body).toHaveProperty('hitRate')
		expect(res.body).toHaveProperty('avgLatencyMs')
	})

	it('tracks cache hits and misses', async () => {
		await request(app).get('/api/categories').expect(200)

		await request(app).get('/api/categories').expect(200)

		const metrics = await request(app)
			.get('/api/admin/cache-metrics')
			.expect(200)

		expect(metrics.body.misses).toBeGreaterThanOrEqual(1)
		expect(metrics.body.hits).toBeGreaterThanOrEqual(1)
	})
})
