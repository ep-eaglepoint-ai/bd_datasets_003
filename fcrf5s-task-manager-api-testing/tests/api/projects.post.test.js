const { request, reset } = require('../helpers/testServer')

describe('POST /projects', () => {
	beforeEach(() => reset())

	it('should create a project when valid data is provided', async () => {
		const res = await request
			.post('/projects')
			.send({
				name: 'Project Alpha',
				description: 'Important project',
				organization: 'Org1',
			})
			.expect(201)

		expect(res.body.id).toBeDefined()
		expect(res.body.name).toBe('Project Alpha')
		expect(res.body.description).toBe('Important project')
		expect(res.body.organization).toBe('Org1')
		expect(res.body.createdAt).toBeDefined()
	})

	it('should return 400 when project name is missing', async () => {
		const res = await request
			.post('/projects')
			.send({
				description: 'Missing name',
			})
			.expect(400)

		expect(res.body.error).toBe('Project name is required')
	})

	it('should return 409 when duplicate project name exists in same organization', async () => {
		await request
			.post('/projects')
			.send({
				name: 'Duplicate Project',
				organization: 'OrgX',
			})
			.expect(201)

		const res = await request
			.post('/projects')
			.send({
				name: 'Duplicate Project',
				organization: 'OrgX',
			})
			.expect(409)

		expect(res.body.error).toMatch(/already exists/i)
	})

	it('should allow duplicate project names when organizations differ', async () => {
		await request
			.post('/projects')
			.send({
				name: 'Same Name',
				organization: 'OrgA',
			})
			.expect(201)

		const res = await request
			.post('/projects')
			.send({
				name: 'Same Name',
				organization: 'OrgB',
			})
			.expect(201)

		expect(res.body.organization).toBe('OrgB')
	})

	it('should assign default values when optional fields are missing', async () => {
		const res = await request
			.post('/projects')
			.send({
				name: 'Default Test',
			})
			.expect(201)

		expect(res.body.description).toBe('')
		expect(res.body.organization).toBe('default')
	})
})
