
type Id = string

function generateId(): Id {
	return Math.random().toString(36).slice(2)
}

export class FakePrisma {
	users = new Map<Id, any>()
	articles = new Map<Id, any>()
	categories = new Map<Id, any>()
	comments = new Map<Id, any>()
	tags = new Map<Id, any>()

	constructor() {

		const categoryId = generateId()
		const userId = generateId()

		this.categories.set(categoryId, {
			id: categoryId,
			name: 'Test Category',
			slug: 'test-category',
			parentId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		})

		this.users.set(userId, {
			id: userId,
			email: 'test@test.com',
			name: 'Test User',
			createdAt: new Date(),
			updatedAt: new Date(),
		})

		const articleId = generateId()

		this.articles.set(articleId, {
			id: articleId,
			title: 'Test Article',
			content: 'Test content',
			excerpt: 'Test excerpt',
			viewCount: 10,
			authorId: userId,
			categoryId,
			createdAt: new Date(),
			updatedAt: new Date(),
			tags: [],
			comments: [],
		})
	}

	user = {
		findUnique: async ({ where }: any) => {
			return this.users.get(where.id) || null
		},

		update: async ({ where, data }: any) => {
			const existing = this.users.get(where.id)

			if (!existing) throw new Error('User not found')

			const updated = {
				...existing,
				...data,
				updatedAt: new Date(),
			}

			this.users.set(where.id, updated)

			return updated
		},
	}

	category = {
		findMany: async () => {
			return Array.from(this.categories.values())
		},

		findUnique: async ({ where }: any) => {
			return this.categories.get(where.id) || null
		},

		create: async ({ data }: any) => {
			const id = generateId()

			const category = {
				id,
				...data,
				createdAt: new Date(),
				updatedAt: new Date(),
			}

			this.categories.set(id, category)

			return category
		},

		update: async ({ where, data }: any) => {
			const existing = this.categories.get(where.id)

			if (!existing) throw new Error('Category not found')

			const updated = {
				...existing,
				...data,
				updatedAt: new Date(),
			}

			this.categories.set(where.id, updated)

			return updated
		},

		delete: async ({ where }: any) => {
			this.categories.delete(where.id)

			return {}
		},
	}

	article = {
		findMany: async () => {
			return Array.from(this.articles.values())
		},

		findUnique: async ({ where }: any) => {
			return this.articles.get(where.id) || null
		},

		create: async ({ data }: any) => {
			const id = generateId()

			const article = {
				id,
				...data,
				createdAt: new Date(),
				updatedAt: new Date(),
				viewCount: 0,
				tags: [],
				comments: [],
			}

			this.articles.set(id, article)

			return article
		},

		update: async ({ where, data }: any) => {
			const existing = this.articles.get(where.id)

			if (!existing) throw new Error('Article not found')

			const updated = {
				...existing,
				...data,
				updatedAt: new Date(),
			}

			this.articles.set(where.id, updated)

			return updated
		},

		delete: async ({ where }: any) => {
			this.articles.delete(where.id)

			return {}
		},

		count: async () => {
			return this.articles.size
		},

		aggregate: async () => {
			let total = 0

			for (const article of this.articles.values()) {
				total += article.viewCount || 0
			}

			return {
				_sum: {
					viewCount: total,
				},
			}
		},
	}
}
