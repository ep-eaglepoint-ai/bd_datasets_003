import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { articles } from '@/lib/articles'
import { formatLongDate } from '@/utils/date'

interface PageProps {
  params: {
    id: string
  }
}

export default function ArticlePage({ params }: PageProps) {
  const article = articles.find(a => String(a.id) === String(params.id))

  if (!article) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link 
            href="/" 
            className="inline-flex items-center text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Articles
          </Link>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <span className="inline-block px-3 py-1 text-sm font-semibold text-white bg-gray-900 rounded-full mb-4">
            {article.category}
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            {article.title}
          </h1>
          <div className="flex items-center gap-4 text-gray-600 mb-6">
            <span className="font-medium">{article.author}</span>
            <span>•</span>
            <time dateTime={article.publishedAt} className="font-medium">
              {formatLongDate(article.publishedAt)}
            </time>
          </div>
        </div>

        <div className="relative h-96 md:h-[500px] mb-8 rounded-lg overflow-hidden">
          <Image
            src={article.imageUrl}
            alt={article.title}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 896px"
          />
        </div>

        <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-p:leading-relaxed prose-p:tracking-wide">
          <div className="whitespace-pre-line text-gray-700 leading-relaxed tracking-wide text-lg">
            {article.content}
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link 
            href="/" 
            className="inline-flex items-center text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Articles
          </Link>
        </div>
      </article>
    </div>
  )
}

