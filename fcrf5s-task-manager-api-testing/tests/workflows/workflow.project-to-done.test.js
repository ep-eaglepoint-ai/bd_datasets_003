// tests/workflows/workflow.project-to-done.test.js
const { request, reset } = require('../helpers/testServer')

describe('Workflow: project -> tasks -> assignments -> status transitions -> progress', () => {
	beforeEach(() => reset())

	it('should complete a full workflow when tasks are progressed from todo to done', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Workflow Project', organization: 'OrgWF' })
			.expect(201)

		const t1 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task 1' })
			.expect(201)

		const t2 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task 2' })
			.expect(201)

		const t3 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task 3' })
			.expect(201)

		await request
			.put(`/tasks/${t1.body.id}/assign`)
			.send({ assignee: 'alice' })
			.expect(200)
		await request
			.put(`/tasks/${t2.body.id}/assign`)
			.send({ assignee: 'bob' })
			.expect(200)
		await request
			.put(`/tasks/${t3.body.id}/assign`)
			.send({ assignee: 'charlie' })
			.expect(200)


		await request
			.put(`/tasks/${t1.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)
		await request
			.put(`/tasks/${t1.body.id}/status`)
			.send({ status: 'review' })
			.expect(200)
		await request
			.put(`/tasks/${t1.body.id}/status`)
			.send({ status: 'done' })
			.expect(200)

		await request
			.put(`/tasks/${t2.body.id}/status`)
			.send({ status: 'in-progress' })
			.expect(200)
		await request
			.put(`/tasks/${t2.body.id}/status`)
			.send({ status: 'review' })
			.expect(200)


		const progress = await request
			.get(`/projects/${project.body.id}/progress`)
			.expect(200)

		expect(progress.body.projectId).toBe(project.body.id)
		expect(progress.body.totalTasks).toBe(3)
		expect(progress.body.statusCounts).toEqual({
			todo: 1,
			'in-progress': 0,
			review: 1,
			done: 1,
		})
		expect(progress.body.completionPercentage).toBe(33) // 1/3 rounded
	})
})
