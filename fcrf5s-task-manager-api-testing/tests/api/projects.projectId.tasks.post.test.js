const { request, reset } = require('../helpers/testServer')

describe('POST /projects/:projectId/tasks', () => {
	beforeEach(() => reset())

	it('should create a task within a project when valid data is provided', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Project A' })
			.expect(201)

		const res = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({
				title: 'Implement API',
				description: 'Build endpoints',
				priority: 'high',
			})
			.expect(201)

		expect(res.body.id).toBeDefined()
		expect(res.body.projectId).toBe(project.body.id)
		expect(res.body.title).toBe('Implement API')
		expect(res.body.description).toBe('Build endpoints')
		expect(res.body.priority).toBe('high')
		expect(res.body.status).toBe('todo')
		expect(res.body.assignee).toBeNull()
		expect(Array.isArray(res.body.statusHistory)).toBe(true)
		expect(res.body.statusHistory[0].status).toBe('todo')
		expect(res.body.createdAt).toBeDefined()
	})

	it('should set default values when optional fields are missing', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Project Defaults' })
			.expect(201)

		const res = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task With Defaults' })
			.expect(201)

		expect(res.body.description).toBe('')
		expect(res.body.priority).toBe('medium')
		expect(res.body.status).toBe('todo')
		expect(res.body.assignee).toBeNull()
	})

	it('should return 400 when task title is missing', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Project B' })
			.expect(201)

		const res = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ description: 'No title' })
			.expect(400)

		expect(res.body.error).toBe('Task title is required')
	})

	it('should return 404 when project does not exist', async () => {
		const res = await request
			.post('/projects/9999/tasks')
			.send({ title: 'Task in nowhere' })
			.expect(404)

		expect(res.body.error).toBe('Project not found')
	})

	it('should return 400 when project ID format is invalid', async () => {
		const res = await request
			.post('/projects/not-a-number/tasks')
			.send({ title: 'Bad projectId' })
			.expect(400)

		expect(res.body.error).toBe('Invalid project ID format')
	})
})
