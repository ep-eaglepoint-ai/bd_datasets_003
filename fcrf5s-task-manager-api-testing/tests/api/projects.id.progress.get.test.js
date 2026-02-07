const { request, reset } = require('../helpers/testServer')

describe('GET /projects/:id/progress', () => {
	beforeEach(() => reset())

	it('should return zero progress when a project has no tasks', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Empty Progress' })
			.expect(201)

		const res = await request
			.get(`/projects/${project.body.id}/progress`)
			.expect(200)

		expect(res.body.projectId).toBe(project.body.id)
		expect(res.body.totalTasks).toBe(0)
		expect(res.body.statusCounts).toEqual({
			todo: 0,
			'in-progress': 0,
			review: 0,
			done: 0,
		})
		expect(res.body.completionPercentage).toBe(0)
	})

	it('should return correct status counts and completion percentage when tasks span multiple statuses', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Progress Project' })
			.expect(201)

		const t1 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Todo Task' })
			.expect(201)
		const t2 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'In Progress Task' })
			.expect(201)
		const t3 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Review Task' })
			.expect(201)
		const t4 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Done Task' })
			.expect(201)

		await request
			.put(`/tasks/${t2.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)

		await request
			.put(`/tasks/${t3.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)
		await request
			.put(`/tasks/${t3.body.id}/status`)
			.send({ status: 'review' })
			.expect(200)

		await request
			.put(`/tasks/${t4.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)
		await request
			.put(`/tasks/${t4.body.id}/status`)
			.send({ status: 'review' })
			.expect(200)
		await request
			.put(`/tasks/${t4.body.id}/status`)
			.send({ status: 'done' })
			.expect(200)

		const res = await request
			.get(`/projects/${project.body.id}/progress`)
			.expect(200)

		expect(res.body.totalTasks).toBe(4)

		expect(res.body.statusCounts).toEqual({
			todo: 1,
			'in-progress': 1,
			review: 1,
			done: 1,
		})

		expect(res.body.completionPercentage).toBe(25)
	})

	it('should return 404 when project does not exist', async () => {
		const res = await request.get('/projects/9999/progress').expect(404)
		expect(res.body.error).toBe('Project not found')
	})

	it('should return 400 when project ID format is invalid', async () => {
		const res = await request.get('/projects/abc/progress').expect(400)
		expect(res.body.error).toBe('Invalid project ID format')
	})
})
