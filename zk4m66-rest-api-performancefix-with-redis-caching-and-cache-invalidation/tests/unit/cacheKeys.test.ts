
import { describe, it, expect } from '@jest/globals'
import { buildCacheKey } from '../../repository_after/src/cache/cacheKeys'

function makeReq(query: any = {}, userId?: string) {
	return {
		query,
		header: (name: string) => {
			if (name === 'x-user-id') return userId
			return undefined
		},
	} as any
}

describe('cacheKeys', () => {
	it('includes query params in key', () => {
		const req = makeReq({ page: 1, limit: 10 })

		const key = buildCacheKey('articles_list', req)

		expect(key).toContain('"page":1')
		expect(key).toContain('"limit":10')
	})

	it('includes resource id when provided', () => {
		const req = makeReq()

		const key = buildCacheKey('article', req, '123')

		expect(key).toContain('article:123')
	})

	it('includes user scope', () => {
		const req = makeReq({}, 'user123')

		const key = buildCacheKey('user', req, 'user123')

		expect(key).toContain('user:user123')
	})

	it('stable ordering of params', () => {
		const req1 = makeReq({ a: 1, b: 2 })
		const req2 = makeReq({ b: 2, a: 1 })

		const key1 = buildCacheKey('articles_list', req1)
		const key2 = buildCacheKey('articles_list', req2)

		expect(key1).toEqual(key2)
	})
})
