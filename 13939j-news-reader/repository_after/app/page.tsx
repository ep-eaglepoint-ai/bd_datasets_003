'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { articles, Article } from '@/lib/articles'
import Image from 'next/image'

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All')

  const categories = useMemo(() => {
    const cats = new Set(articles.map(article => article.category))
    return ['All', ...Array.from(cats)].sort()
  }, [])

  const filteredArticles = useMemo(() => {
    if (selectedCategory === 'All') {
      return articles
    }
    return articles.filter(article => article.category === selectedCategory)
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

function HeroArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/article/${article.id}`} className="block group">
      <div className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300 h-full">
        <div className="relative h-64 md:h-80 overflow-hidden">
          <Image
            src={article.imageUrl}
            alt={article.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
        <div className="p-6">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-white bg-gray-900 rounded-full mb-3">
            {article.category}
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 group-hover:text-gray-700 transition-colors">
            {article.title}
          </h2>
          <p className="text-gray-600 mb-4 line-clamp-3">{article.excerpt}</p>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{article.author}</span>
            <time dateTime={article.publishedAt}>
              {new Date(article.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </time>
          </div>
        </div>
      </div>
    </Link>
  )
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/article/${article.id}`} className="block group">
      <div className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300 h-full flex flex-col">
        <div className="relative h-48 overflow-hidden">
          <Image
            src={article.imageUrl}
            alt={article.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <span className="inline-block px-2 py-1 text-xs font-semibold text-white bg-gray-900 rounded-full mb-2 self-start">
            {article.category}
          </span>
          <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors line-clamp-2">
            {article.title}
          </h3>
          <p className="text-gray-600 text-sm mb-3 line-clamp-2 flex-1">{article.excerpt}</p>
          <div className="flex items-center justify-between text-xs text-gray-500 mt-auto">
            <span>{article.author}</span>
            <time dateTime={article.publishedAt}>
              {new Date(article.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </time>
          </div>
        </div>
      </div>
    </Link>
  )
}

