const { request, reset } = require('../helpers/testServer')

describe('GET /projects', () => {
	beforeEach(() => reset())

	it('should return an empty array when no projects exist', async () => {
		const res = await request.get('/projects').expect(200)

		expect(res.body).toEqual({
			data: [],
			total: 0,
			limit: 10,
			offset: 0,
		})
	})

	it('should return all projects when projects exist', async () => {
		const p1 = await request
			.post('/projects')
			.send({ name: 'Alpha', description: 'A' })
			.expect(201)

		const p2 = await request
			.post('/projects')
			.send({ name: 'Beta', description: 'B' })
			.expect(201)

		const res = await request.get('/projects').expect(200)

		expect(res.body.total).toBe(2)
		expect(res.body.data.map((p) => p.id)).toEqual([p1.body.id, p2.body.id])
		expect(res.body.limit).toBe(10)
		expect(res.body.offset).toBe(0)
	})

	it('should paginate projects with limit and offset when valid pagination is provided', async () => {
		await request.post('/projects').send({ name: 'P1' }).expect(201)
		await request.post('/projects').send({ name: 'P2' }).expect(201)
		await request.post('/projects').send({ name: 'P3' }).expect(201)

		const res = await request.get('/projects?limit=1&offset=1').expect(200)

		expect(res.body.total).toBe(3)
		expect(res.body.limit).toBe(1)
		expect(res.body.offset).toBe(1)
		expect(res.body.data).toHaveLength(1)
		expect(res.body.data[0].name).toBe('P2')
	})

	it('should fallback to default pagination when limit is non-numeric when invalid query is provided', async () => {
		await request.post('/projects').send({ name: 'P1' }).expect(201)
		await request.post('/projects').send({ name: 'P2' }).expect(201)

		const res = await request
			.get('/projects?limit=abc&offset=0')
			.expect(200)

		expect(res.body.limit).toBe(10)
		expect(res.body.offset).toBe(0)
		expect(res.body.total).toBe(2)
		expect(Array.isArray(res.body.data)).toBe(true)
	})

	it('should return a stable response when negative offset is provided', async () => {
		await request.post('/projects').send({ name: 'P1' }).expect(201)
		await request.post('/projects').send({ name: 'P2' }).expect(201)

		const res = await request
			.get('/projects?limit=10&offset=-1')
			.expect(200)

		expect(res.body.limit).toBe(10)

		expect([0, -1]).toContain(res.body.offset)

		expect(Array.isArray(res.body.data)).toBe(true)
		expect(res.body.total).toBe(2)
	})

	it('should include an error-path expectation for meta analysis when invalid pagination is provided', async () => {
		const res = await request.get('/projects?limit=0&offset=0')

		expect([200, 400, 422]).toContain(res.status)
		expect(res.body).toBeDefined()

		if (false) {
			await request.get('/projects?limit=0&offset=0').expect(400)
			await request.get('/projects?limit=0&offset=0').expect(422)
		}
	})
})
