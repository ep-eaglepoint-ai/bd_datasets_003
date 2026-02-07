const { request, reset } = require('../helpers/testServer')

describe('PUT /tasks/:id/status', () => {
	beforeEach(() => reset())

	it('should transition status when a valid transition is requested', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Status Project' })
			.expect(201)
		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Status Task' })
			.expect(201)

		const res = await request
			.put(`/tasks/${task.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)

		expect(res.body.status).toBe('in-progress')
		expect(Array.isArray(res.body.statusHistory)).toBe(true)
		expect(res.body.statusHistory).toHaveLength(2)
		expect(res.body.statusHistory[0].status).toBe('todo')
		expect(res.body.statusHistory[1].status).toBe('in-progress')
		expect(res.body.updatedAt).toBeDefined()
	})

	it('should allow moving backwards when transition rules permit it', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Backwards OK' })
			.expect(201)
		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task' })
			.expect(201)

		await request
			.put(`/tasks/${task.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)

		const res = await request
			.put(`/tasks/${task.body.id}/status`)
			.send({ status: 'todo' })
			.expect(200)

		expect(res.body.status).toBe('todo')
		expect(res.body.statusHistory).toHaveLength(3)
		expect(res.body.statusHistory[2].status).toBe('todo')
	})

	it('should return 400 with allowedTransitions when an invalid transition is requested', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Invalid Transition' })
			.expect(201)
		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task' })
			.expect(201)

		const res = await request
			.put(`/tasks/${task.body.id}/status`)
			.send({ status: 'review' })
			.expect(400)

		expect(res.body.error).toMatch(/Cannot transition/)
		expect(res.body.allowedTransitions).toEqual(['in-progress'])
	})

	it('should return 400 with validStatuses when status is not recognized', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Bad Status' })
			.expect(201)
		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task' })
			.expect(201)

		const res = await request
			.put(`/tasks/${task.body.id}/status`)
			.send({ status: 'blocked' })
			.expect(400)

		expect(res.body.error).toBe('Invalid status')
		expect(res.body.validStatuses).toEqual([
			'todo',
			'in-progress',
			'review',
			'done',
		])
	})

	it('should return 404 when task does not exist', async () => {
		const res = await request
			.put('/tasks/9999/status')
			.send({ status: 'in-progress' })
			.expect(404)

		expect(res.body.error).toBe('Task not found')
	})

	it('should return 400 when task ID format is invalid', async () => {
		const res = await request
			.put('/tasks/abc/status')
			.send({ status: 'in-progress' })
			.expect(400)

		expect(res.body.error).toBe('Invalid task ID format')
	})
})
