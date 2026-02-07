export type ResourceName =
	| 'articles_list'
	| 'article'
	| 'categories_list'
	| 'category'
	| 'user'
	| 'user_articles'
	| 'popular_articles'
	| 'category_stats'
	| 'category_tree'

export type CacheTTL = {
	softTtl: number
	hardTtl: number
}

export const CACHE_TTL: Record<ResourceName, CacheTTL> = {
	articles_list: { softTtl: 30, hardTtl: 120 },
	article: { softTtl: 60, hardTtl: 300 },

	categories_list: { softTtl: 300, hardTtl: 3600 },
	category: { softTtl: 300, hardTtl: 3600 },
	category_tree: { softTtl: 300, hardTtl: 3600 },
	user: { softTtl: 30, hardTtl: 120 },
	user_articles: { softTtl: 30, hardTtl: 120 },
	popular_articles: { softTtl: 60, hardTtl: 300 },
	category_stats: { softTtl: 120, hardTtl: 600 },
}
