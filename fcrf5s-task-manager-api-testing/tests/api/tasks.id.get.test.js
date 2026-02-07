const { request, reset } = require('../helpers/testServer')

describe('GET /tasks/:id', () => {
	beforeEach(() => reset())

	it('should return a task when it exists', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Task Holder' })
			.expect(201)

		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Get Me' })
			.expect(201)

		const res = await request.get(`/tasks/${task.body.id}`).expect(200)

		expect(res.body.id).toBe(task.body.id)
		expect(res.body.projectId).toBe(project.body.id)
		expect(res.body.title).toBe('Get Me')
		expect(res.body.status).toBe('todo')
	})

	it('should return 404 when task does not exist', async () => {
		const res = await request.get('/tasks/9999').expect(404)
		expect(res.body.error).toBe('Task not found')
	})

	it('should return 400 when task ID format is invalid', async () => {
		const res = await request.get('/tasks/abc').expect(400)
		expect(res.body.error).toBe('Invalid task ID format')
	})
})
