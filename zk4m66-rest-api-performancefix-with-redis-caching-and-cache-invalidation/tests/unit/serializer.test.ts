import { describe, it, expect } from '@jest/globals'

import {
	serializeCacheEntry,
	deserializeCacheEntry,
} from '../../repository_after/src/cache/serializer'

describe('serializer', () => {
	it('serializes and deserializes basic object', () => {
		const input = {
			data: {
				id: '123',
				title: 'Test',
			},
			cachedAt: Date.now(),
		}

		const raw = serializeCacheEntry(input)

		const output = deserializeCacheEntry(raw)

		expect(output).toEqual(input)
	})

	it('preserves Date objects', () => {
		const date = new Date()

		const input = {
			data: {
				createdAt: date,
			},
			cachedAt: Date.now(),
		}

		const raw = serializeCacheEntry(input)

		const output = deserializeCacheEntry(raw)

		expect(output?.data.createdAt).toBeInstanceOf(Date)
		expect(output?.data.createdAt.getTime()).toBe(date.getTime())
	})

	it('preserves nested objects and arrays', () => {
		const input = {
			data: {
				list: [1, 2, 3],
				nested: {
					foo: 'bar',
				},
			},
			cachedAt: Date.now(),
		}

		const raw = serializeCacheEntry(input)

		const output = deserializeCacheEntry(raw)

		expect(output).toEqual(input)
	})

	it('returns null on invalid JSON', () => {
		const result = deserializeCacheEntry('invalid')

		expect(result).toBeNull()
	})
})
