const { request, reset } = require('../helpers/testServer')

describe('PUT /tasks/:id/assign', () => {
	beforeEach(() => reset())

	it('should assign a task to a valid team member when assignee is valid', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Assign Project' })
			.expect(201)
		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Assignable Task' })
			.expect(201)

		const res = await request
			.put(`/tasks/${task.body.id}/assign`)
			.send({ assignee: 'alice' })
			.expect(200)

		expect(res.body.assignee).toBe('alice')
		expect(res.body.updatedAt).toBeDefined()
	})

	it('should return 400 and validMembers when assignee is not a known team member', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Invalid Assignee' })
			.expect(201)
		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task' })
			.expect(201)

		const res = await request
			.put(`/tasks/${task.body.id}/assign`)
			.send({ assignee: 'eve' })
			.expect(400)

		expect(res.body.error).toBe('Invalid team member')
		expect(res.body.validMembers).toEqual([
			'alice',
			'bob',
			'charlie',
			'diana',
		])
	})

	it('should clear the assignee when assignee is null', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Unassign Null' })
			.expect(201)
		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task' })
			.expect(201)

		await request
			.put(`/tasks/${task.body.id}/assign`)
			.send({ assignee: 'bob' })
			.expect(200)

		const res = await request
			.put(`/tasks/${task.body.id}/assign`)
			.send({ assignee: null })
			.expect(200)

		expect(res.body.assignee).toBeNull()
	})

	it('should clear the assignee when assignee is an empty string', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Unassign Empty' })
			.expect(201)
		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task' })
			.expect(201)

		await request
			.put(`/tasks/${task.body.id}/assign`)
			.send({ assignee: 'charlie' })
			.expect(200)

		const res = await request
			.put(`/tasks/${task.body.id}/assign`)
			.send({ assignee: '' })
			.expect(200)

		expect(res.body.assignee).toBeNull()
	})

	it('should return 404 when task does not exist', async () => {
		const res = await request
			.put('/tasks/9999/assign')
			.send({ assignee: 'alice' })
			.expect(404)

		expect(res.body.error).toBe('Task not found')
	})

	it('should return 400 when task ID format is invalid', async () => {
		const res = await request
			.put('/tasks/abc/assign')
			.send({ assignee: 'alice' })
			.expect(400)

		expect(res.body.error).toBe('Invalid task ID format')
	})
})
