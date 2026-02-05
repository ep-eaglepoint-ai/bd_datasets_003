import Link from 'next/link'
import Image from 'next/image'
import type { Article } from '@/types/article'
import { formatShortDate } from '@/utils/date'

interface ArticleCardProps {
  article: Article
}

export function ArticleCard({ article }: ArticleCardProps) {
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
            <time dateTime={article.publishedAt}>{formatShortDate(article.publishedAt)}</time>
          </div>
        </div>
      </div>
    </Link>
  )
}


