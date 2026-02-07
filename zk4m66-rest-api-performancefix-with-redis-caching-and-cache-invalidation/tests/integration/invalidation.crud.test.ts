import request from 'supertest'
import { describe, it, expect, beforeEach } from '@jest/globals'
import * as redisClientModule from '../../repository_after/src/cache/redisClient'

import { makeApp } from '../helpers/makeApp'
import { FakeRedis } from '../helpers/fakeRedis'

describe('cache invalidation CRUD', () => {
	let app: any
	let fakeRedis: FakeRedis

	beforeEach(() => {
		fakeRedis = new FakeRedis()

		redisClientModule.__setSafeRedisForTests(fakeRedis as any)

		app = makeApp()
	})

	it('invalidates articles list after create', async () => {
		await request(app).get('/api/articles?page=1&limit=20').expect(200)

		const beforeKeys = await fakeRedis.keys('articles_list:*')
		expect(beforeKeys.length).toBeGreaterThan(0)

		await request(app)
			.post('/api/articles')
			.send({
				title: 'New Article',
				slug: `new-article-${Date.now()}`,
				content: 'content',
				excerpt: 'excerpt',
				authorId: 'user-1',
				categoryId: 'cat-1',
			})
			.expect(201)

		const afterKeys = await fakeRedis.keys('articles_list:*')
		expect(afterKeys.length).toBe(0)
	})

	it('invalidates article after update', async () => {
		const id = 'a-1'

		await request(app).get(`/api/articles/${id}`).expect(200)

		const beforeKeys = await fakeRedis.keys(`article:${id}:*`)
		expect(beforeKeys.length).toBeGreaterThan(0)

		await request(app)
			.put(`/api/articles/${id}`)
			.send({ title: 'Updated Title' })
			.expect(200)

		const afterKeys = await fakeRedis.keys(`article:${id}:*`)
		expect(afterKeys.length).toBe(0)
	})

	it('invalidates article after delete', async () => {
		const id = 'a-2'

		await request(app).get(`/api/articles/${id}`).expect(200)

		const beforeKeys = await fakeRedis.keys(`article:${id}:*`)
		expect(beforeKeys.length).toBeGreaterThan(0)

		await request(app).delete(`/api/articles/${id}`).expect(204)

		const afterKeys = await fakeRedis.keys(`article:${id}:*`)
		expect(afterKeys.length).toBe(0)
	})
})
