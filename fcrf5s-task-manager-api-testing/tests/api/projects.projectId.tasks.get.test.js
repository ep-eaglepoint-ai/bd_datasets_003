const { request, reset } = require('../helpers/testServer')

describe('GET /projects/:projectId/tasks', () => {
	beforeEach(() => reset())

	it('should return an empty array when a project has no tasks', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Empty Project' })
			.expect(201)

		const res = await request
			.get(`/projects/${project.body.id}/tasks`)
			.expect(200)
		expect(res.body).toEqual([])
	})

	it('should return all tasks for a project when tasks exist', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Project Tasks' })
			.expect(201)

		const t1 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'T1' })
			.expect(201)
		const t2 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'T2' })
			.expect(201)

		const res = await request
			.get(`/projects/${project.body.id}/tasks`)
			.expect(200)

		expect(res.body.map((t) => t.id)).toEqual([t1.body.id, t2.body.id])
	})

	it('should filter tasks by status when status query is provided', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Filter Status' })
			.expect(201)

		const todoTask = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Todo' })
			.expect(201)

		const inProgressTask = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'In Progress' })
			.expect(201)

		await request
			.put(`/tasks/${inProgressTask.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)

		const res = await request
			.get(`/projects/${project.body.id}/tasks?status=todo`)
			.expect(200)

		expect(res.body).toHaveLength(1)
		expect(res.body[0].id).toBe(todoTask.body.id)
		expect(res.body[0].status).toBe('todo')
	})

	it('should filter tasks by assignee when assignee query is provided', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Filter Assignee' })
			.expect(201)

		const t1 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'A' })
			.expect(201)
		const t2 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'B' })
			.expect(201)

		await request
			.put(`/tasks/${t1.body.id}/assign`)
			.send({ assignee: 'alice' })
			.expect(200)
		await request
			.put(`/tasks/${t2.body.id}/assign`)
			.send({ assignee: 'bob' })
			.expect(200)

		const res = await request
			.get(`/projects/${project.body.id}/tasks?assignee=alice`)
			.expect(200)

		expect(res.body).toHaveLength(1)
		expect(res.body[0].id).toBe(t1.body.id)
		expect(res.body[0].assignee).toBe('alice')
	})

	it('should filter tasks by status and assignee together when both are provided', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Filter Both' })
			.expect(201)

		const t1 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'A' })
			.expect(201)
		const t2 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'B' })
			.expect(201)

		await request
			.put(`/tasks/${t1.body.id}/assign`)
			.send({ assignee: 'alice' })
			.expect(200)
		await request
			.put(`/tasks/${t2.body.id}/assign`)
			.send({ assignee: 'alice' })
			.expect(200)

		await request
			.put(`/tasks/${t2.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)

		const res = await request
			.get(
				`/projects/${project.body.id}/tasks?assignee=alice&status=in-progress`,
			)
			.expect(200)

		expect(res.body).toHaveLength(1)
		expect(res.body[0].id).toBe(t2.body.id)
		expect(res.body[0].assignee).toBe('alice')
		expect(res.body[0].status).toBe('in-progress')
	})

	it('should return 404 when project does not exist', async () => {
		const res = await request.get('/projects/9999/tasks').expect(404)
		expect(res.body.error).toBe('Project not found')
	})

	it('should return 400 when project ID format is invalid', async () => {
		const res = await request.get('/projects/abc/tasks').expect(400)
		expect(res.body.error).toBe('Invalid project ID format')
	})
})
