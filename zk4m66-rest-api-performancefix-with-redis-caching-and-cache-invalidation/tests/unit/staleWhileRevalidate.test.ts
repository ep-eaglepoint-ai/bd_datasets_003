import { describe, it, expect, beforeEach } from '@jest/globals'

import { FakeRedis } from '../helpers/fakeRedis'
import {
	serializeCacheEntry,
	deserializeCacheEntry,
} from '../../repository_after/src/cache/serializer'
import { refreshInBackground } from '../../repository_after/src/cache/staleWhileRevalidate'
import * as redisClientModule from '../../repository_after/src/cache/redisClient'

describe('staleWhileRevalidate', () => {
	let fakeRedis: FakeRedis

	beforeEach(() => {
		fakeRedis = new FakeRedis()
		redisClientModule.__setSafeRedisForTests(fakeRedis as any)
	})

	it('refreshes cache in background', async () => {
		const key = 'cache:test:key'

		await fakeRedis.set(
			key,
			serializeCacheEntry({
				data: 'old',
				cachedAt: Date.now(),
			}),
			'EX',
			100,
		)

		await refreshInBackground(key, 'articles_list', async () => 'new')

		const raw = await fakeRedis.get(key)
		const entry = deserializeCacheEntry<any>(raw!)

		expect(entry?.data).toBe('new')
	})

	it('does not crash on fetch error', async () => {
		const key = 'cache:test:key2'

		await expect(
			refreshInBackground(key, 'articles_list', async () => {
				throw new Error('fail')
			}),
		).resolves.toBeUndefined()
	})
})
