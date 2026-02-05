import Link from 'next/link'
import Image from 'next/image'
import type { Article } from '@/types/article'
import { formatLongDate } from '@/utils/date'

interface HeroArticleCardProps {
  article: Article
}

export function HeroArticleCard({ article }: HeroArticleCardProps) {
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
            <time dateTime={article.publishedAt}>{formatLongDate(article.publishedAt)}</time>
          </div>
        </div>
      </div>
    </Link>
  )
}


