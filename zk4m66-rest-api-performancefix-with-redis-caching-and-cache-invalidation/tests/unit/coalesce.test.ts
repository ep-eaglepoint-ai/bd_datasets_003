
import { describe, it, expect } from '@jest/globals'

import { coalesce } from '../../repository_after/src/cache/coalesce'

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('coalesce', () => {
	it('returns fetcher result', async () => {
		const result = await coalesce('key1', async () => {
			return 'value'
		})

		expect(result).toBe('value')
	})

	it('only calls fetcher once for concurrent calls', async () => {
		let count = 0

		async function fetcher() {
			count++
			await sleep(50)
			return 'value'
		}

		const [a, b, c] = await Promise.all([
			coalesce('same-key', fetcher),
			coalesce('same-key', fetcher),
			coalesce('same-key', fetcher),
		])

		expect(a).toBe('value')
		expect(b).toBe('value')
		expect(c).toBe('value')

		expect(count).toBe(1)
	})

	it('calls fetcher again after completion', async () => {
		let count = 0

		async function fetcher() {
			count++
			return 'value'
		}

		await coalesce('key', fetcher)
		await coalesce('key', fetcher)

		expect(count).toBe(2)
	})
})
