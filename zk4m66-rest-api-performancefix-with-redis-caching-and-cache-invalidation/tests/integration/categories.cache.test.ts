import request from 'supertest'
import { describe, it, expect, beforeEach } from '@jest/globals'

import { makeApp } from '../helpers/makeApp'
import { FakeRedis } from '../helpers/fakeRedis'

function targetRepoBase(): string {
	return (global as any).__TARGET_REPO__ || '/app/repository_after'
}

describe('categories cache integration', () => {
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

	it('caches categories list', async () => {
		const res1 = await request(app).get('/api/categories').expect(200)
		const res2 = await request(app).get('/api/categories').expect(200)

		expect(res1.body).toEqual(res2.body)
	})

	it('returns etag header', async () => {
		const res = await request(app).get('/api/categories').expect(200)
		expect(res.headers.etag).toBeDefined()
	})

	it('returns 304 when not modified', async () => {
		const res1 = await request(app).get('/api/categories').expect(200)
		const etag = res1.headers.etag

		await request(app)
			.get('/api/categories')
			.set('If-None-Match', etag)
			.expect(304)
	})
})
