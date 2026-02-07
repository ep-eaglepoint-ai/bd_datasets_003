const { request, reset } = require('../helpers/testServer')

describe('Workflow: concurrent-like modifications', () => {
	beforeEach(() => reset())

	it('should maintain consistent task state when multiple updates occur rapidly', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Concurrent Project' })
			.expect(201)

		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Concurrent Task' })
			.expect(201)

		const taskId = task.body.id

		await Promise.all([
			request.put(`/tasks/${taskId}/assign`).send({ assignee: 'alice' }),
			request.put(`/tasks/${taskId}/assign`).send({ assignee: 'bob' }),
			request
				.put(`/tasks/${taskId}/assign`)
				.send({ assignee: 'charlie' }),
		])

		const finalTask = await request.get(`/tasks/${taskId}`).expect(200)

		const validMembers = ['alice', 'bob', 'charlie', 'diana', null]
		expect(validMembers).toContain(finalTask.body.assignee)

		expect(finalTask.body.updatedAt).toBeDefined()
	})

	it('should preserve valid task status when rapid transitions occur', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Concurrent Status Project' })
			.expect(201)

		const task = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Status Task' })
			.expect(201)

		const taskId = task.body.id

		await request
			.put(`/tasks/${taskId}/status`)
			.send({ status: 'in-progress' })
			.expect(200)

		await Promise.all([
			request.put(`/tasks/${taskId}/status`).send({ status: 'review' }),
			request.put(`/tasks/${taskId}/status`).send({ status: 'todo' }), // may fail depending on timing
		])

		const finalTask = await request.get(`/tasks/${taskId}`).expect(200)

		const validStatuses = ['todo', 'in-progress', 'review', 'done']
		expect(validStatuses).toContain(finalTask.body.status)

		expect(Array.isArray(finalTask.body.statusHistory)).toBe(true)
		expect(finalTask.body.statusHistory.length).toBeGreaterThanOrEqual(2)
	})

	it('should return consistent progress totals when rapid updates occur', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Concurrent Progress Project' })
			.expect(201)

		const t1 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task 1' })
			.expect(201)

		const t2 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task 2' })
			.expect(201)

		await Promise.all([
			request
				.put(`/tasks/${t1.body.id}/status`)
				.send({ status: 'in-progress' }),
			request
				.put(`/tasks/${t2.body.id}/status`)
				.send({ status: 'in-progress' }),
		])

		const progress = await request
			.get(`/projects/${project.body.id}/progress`)
			.expect(200)

		expect(progress.body.totalTasks).toBe(2)

		const totalCount =
			progress.body.statusCounts.todo +
			progress.body.statusCounts['in-progress'] +
			progress.body.statusCounts.review +
			progress.body.statusCounts.done

		expect(totalCount).toBe(2)
	})
})
