import crypto from 'crypto'

function stableStringify(obj: any) {
	if (!obj || typeof obj !== 'object') return JSON.stringify(obj)
	return JSON.stringify(obj, Object.keys(obj).sort())
}

function hash(input: string) {
	return crypto.createHash('sha1').update(input).digest('hex').slice(0, 12)
}

export const cacheKey = {
	articlesList(params: {
		page: number
		limit: number
		category?: string
		search?: string
	}) {
		const suffix = hash(stableStringify(params))
		return `articles_list:${suffix}`
	},

	articleById(id: string) {
		return `article:${id}`
	},

	categoriesList() {
		return `categories_list:v1`
	},

	categoryById(id: string) {
		return `category:${id}`
	},

	userById(id: string) {
		return `user:${id}`
	},

	userArticles(id: string, params: { page: number; limit: number }) {
		const suffix = hash(stableStringify(params))
		return `user_articles:${id}:${suffix}`
	},

	withEtag(prefixKey: string, etag: string) {
		return `${prefixKey}:etag:${etag}`
	},
}

export function buildCacheKey(
	resource: string,
	req: { query?: any; header?: (name: string) => any },
	id?: string,
) {
	const queryObj = req?.query ?? {}
	const queryJson = stableStringify(queryObj)

	const headerUser = req?.header?.('x-user-id')
	const userScope = headerUser ? `user:${String(headerUser)}` : undefined

	const parts: string[] = [`cache:${resource}`]

	if (id) {
		parts.push(String(id))
	}

	parts.push(queryJson)

	if (userScope) {
		parts.push(userScope)
	}

	return parts.join(':')
}
