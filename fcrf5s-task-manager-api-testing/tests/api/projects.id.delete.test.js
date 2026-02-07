const { request, reset } = require('../helpers/testServer')

describe('DELETE /projects/:id', () => {
	beforeEach(() => reset())

	it('should delete a project when it exists', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Delete Me' })
			.expect(201)

		await request.delete(`/projects/${project.body.id}`).expect(204)

		const res = await request
			.get(`/projects/${project.body.id}`)
			.expect(404)
		expect(res.body.error).toBe('Project not found')
	})

	it('should return 404 when project does not exist', async () => {
		const res = await request.delete('/projects/9999').expect(404)
		expect(res.body.error).toBe('Project not found')
	})

	it('should return 400 when project ID format is invalid', async () => {
		const res = await request.delete('/projects/abc').expect(400)
		expect(res.body.error).toBe('Invalid project ID format')
	})

	it('should remove all associated tasks when deleting a project', async () => {
		const project = await request
			.post('/projects')
			.send({ name: 'Project To Remove' })
			.expect(201)

		const t1 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task A' })
			.expect(201)

		const t2 = await request
			.post(`/projects/${project.body.id}/tasks`)
			.send({ title: 'Task B' })
			.expect(201)

		await request.get(`/tasks/${t1.body.id}`).expect(200)
		await request.get(`/tasks/${t2.body.id}`).expect(200)

		await request.delete(`/projects/${project.body.id}`).expect(204)

		const r1 = await request.get(`/tasks/${t1.body.id}`).expect(404)
		expect(r1.body.error).toBe('Task not found')

		const r2 = await request.get(`/tasks/${t2.body.id}`).expect(404)
		expect(r2.body.error).toBe('Task not found')
	})
})
