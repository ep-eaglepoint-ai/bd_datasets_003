'use client'

import { useState, useMemo } from 'react'
import { articles } from '@/lib/articles'
import { HeroArticleCard } from '@/components/HeroArticleCard'
import { ArticleCard } from '@/components/ArticleCard'

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All')

  const categories = useMemo(() => {
    const cats = new Set(articles.map((article) => article.category))
    return ['All', ...Array.from(cats)].sort()
  }, [])

  const filteredArticles = useMemo(() => {
    if (selectedCategory === 'All') {
      return articles
    }
    return articles.filter((article) => article.category === selectedCategory)
  }, [selectedCategory])

  const heroArticles = filteredArticles.slice(0, 2)
  const gridArticles = filteredArticles.slice(2)

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Digital News Reader</h1>
          <nav className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {heroArticles.length > 0 && (
          <section className="mb-12">
            <div className={`grid gap-6 ${heroArticles.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
              {heroArticles.map((article) => (
                <HeroArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        )}

        {gridArticles.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {selectedCategory === 'All' ? 'All Articles' : `${selectedCategory} Articles`}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {gridArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        )}

        {filteredArticles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No articles found in this category.</p>
          </div>
        )}
      </main>
    </div>
  )
}

