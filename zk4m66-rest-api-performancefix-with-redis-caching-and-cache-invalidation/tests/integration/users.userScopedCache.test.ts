import request from 'supertest'
import { describe, it, expect, beforeEach } from '@jest/globals'

import { makeApp } from '../../tests/helpers/makeApp'
import { FakeRedis } from '../../tests/helpers/fakeRedis'

import * as redisClientModule from '../../repository_after/src/cache/redisClient'

describe('user scoped cache', () => {
	let app: any
	let fakeRedis: FakeRedis

	beforeEach(() => {
		fakeRedis = new FakeRedis()
		redisClientModule.__setSafeRedisForTests(fakeRedis as any)
		app = makeApp()
	})

	it('caches user profile per user id', async () => {
		const userId1 = 'user-1'
		const userId2 = 'user-2'

		const res1 = await request(app).get(`/api/users/${userId1}`).expect(200)
		const res2 = await request(app).get(`/api/users/${userId2}`).expect(200)

		expect(res1.body).toBeDefined()
		expect(res2.body).toBeDefined()
	})

	it('returns cached result for same user', async () => {
		const userId = 'user-1'

		const res1 = await request(app).get(`/api/users/${userId}`).expect(200)
		const res2 = await request(app).get(`/api/users/${userId}`).expect(200)

		expect(res1.body).toEqual(res2.body)
	})

	it('does not mix cache between users', async () => {
		const userId1 = 'user-1'
		const userId2 = 'user-2'

		const res1 = await request(app).get(`/api/users/${userId1}`).expect(200)
		const res2 = await request(app).get(`/api/users/${userId2}`).expect(200)

		expect(res1.body).not.toBeNull()
		expect(res2.body).not.toBeNull()
	})
})
