import { describe, it, expect } from '@jest/globals'

import {
	computeEtag,
	isNotModified,
} from '../../repository_after/src/cache/etag'

describe('etag', () => {
	it('generates stable etag for same content', () => {
		const data = { id: 1, name: 'test' }

		const etag1 = computeEtag(data)
		const etag2 = computeEtag(data)

		expect(etag1).toBe(etag2)
	})

	it('generates different etag for different content', () => {
		const etag1 = computeEtag({ id: 1 })
		const etag2 = computeEtag({ id: 2 })

		expect(etag1).not.toBe(etag2)
	})

	it('detects not modified', () => {
		const data = { foo: 'bar' }

		const etag = computeEtag(data)

		const result = isNotModified(etag, etag)

		expect(result).toBe(true)
	})

	it('detects modified', () => {
		const etag1 = computeEtag({ a: 1 })
		const etag2 = computeEtag({ a: 2 })

		const result = isNotModified(etag1, etag2)

		expect(result).toBe(false)
	})

	it('handles undefined request etag', () => {
		const etag = computeEtag({ test: true })

		const result = isNotModified(undefined, etag)

		expect(result).toBe(false)
	})
})
