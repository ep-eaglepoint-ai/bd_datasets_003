const { request, reset } = require('../helpers/testServer')

describe('GET /projects/:id', () => {
	beforeEach(() => reset())

	it('should return the project with taskCount when project exists', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Project With Tasks' })
			.expect(201)

		await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task 1' })
			.expect(201)

		await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task 2' })
			.expect(201)

		const res = await request
			.get(`/projects/${project.body.id}`)
			.expect(200)

		expect(res.body.id).toBe(project.body.id)
		expect(res.body.name).toBe('Project With Tasks')
		expect(res.body.taskCount).toBe(2)
	})

	it('should return 404 when project does not exist', async () => {
		const res = await request.get('/projects/9999').expect(404)

		expect(res.body.error).toBe('Project not found')
	})

	it('should return 400 when project ID format is invalid', async () => {
		const res = await request.get('/projects/not-a-number').expect(400)

		expect(res.body.error).toBe('Invalid project ID format')
	})
})
