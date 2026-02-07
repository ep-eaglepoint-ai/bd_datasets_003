import request from 'supertest'
import { describe, it, expect, beforeEach } from '@jest/globals'

import { makeApp } from '../../tests/helpers/makeApp'

import * as redisClientModule from '../../repository_after/src/cache/redisClient'

describe('redis down fallback', () => {
	let app: any

	beforeEach(() => {
		redisClientModule.__setSafeRedisForTests({
			get: async () => {
				throw new Error('Redis down')
			},
			set: async () => {
				throw new Error('Redis down')
			},
			del: async () => {
				throw new Error('Redis down')
			},
			scan: async () => {
				throw new Error('Redis down')
			},
		} as any)

		app = makeApp()
	})

	it('serves articles even when redis fails', async () => {
		const res = await request(app).get('/api/articles').expect(200)

		expect(res.body).toBeDefined()
	})

	it('serves categories even when redis fails', async () => {
		const res = await request(app).get('/api/categories').expect(200)

		expect(res.body).toBeDefined()
	})
})
