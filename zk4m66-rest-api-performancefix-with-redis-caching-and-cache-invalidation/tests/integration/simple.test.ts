import { describe, expect, test } from '@jest/globals'
import request from 'supertest'
import express from 'express'

describe('Simple route test', () => {
	test('test route works', async () => {
		const app = express()
		app.get('/test', (req, res) => res.json({ ok: true }))

		const response = await request(app).get('/test').expect(200)
		expect(response.body.ok).toBe(true)
	})
})
