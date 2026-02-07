import { describe, it, expect, beforeEach } from '@jest/globals'

import { FakeRedis } from '../helpers/fakeRedis'
import { invalidatePattern } from '../../repository_after/src/cache/invalidate'
import { serializeCacheEntry } from '../../repository_after/src/cache/serializer'
import * as redisClientModule from '../../repository_after/src/cache/redisClient'

describe('invalidatePattern', () => {
	let fakeRedis: FakeRedis

	beforeEach(() => {
		fakeRedis = new FakeRedis()
		redisClientModule.__setSafeRedisForTests(fakeRedis as any)
	})

	it('removes only matching keys', async () => {
		await fakeRedis.set(
			'cache:article:1',
			serializeCacheEntry({ data: 1, cachedAt: Date.now() }),
			'EX',
			100,
		)

		await fakeRedis.set(
			'cache:article:2',
			serializeCacheEntry({ data: 2, cachedAt: Date.now() }),
			'EX',
			100,
		)

		await fakeRedis.set(
			'cache:user:1',
			serializeCacheEntry({ data: 3, cachedAt: Date.now() }),
			'EX',
			100,
		)

		await invalidatePattern('cache:article:*')

		const a = await fakeRedis.get('cache:article:1')
		const b = await fakeRedis.get('cache:article:2')
		const c = await fakeRedis.get('cache:user:1')

		expect(a).toBeNull()
		expect(b).toBeNull()
		expect(c).not.toBeNull()
	})
})
