import { prisma } from '../db/prisma';

export class ArticleService {
  async getPopularArticles(limit: number = 10) {
    const articles = await prisma.article.findMany({
      take: limit,
      orderBy: { viewCount: 'desc' },
      include: {
        author: true,
        category: true,
        _count: {
          select: { comments: true }
        }
      }
    });

    return articles;
  }

  async getArticleStats() {
    const totalArticles = await prisma.article.count();
    const totalViews = await prisma.article.aggregate({
      _sum: { viewCount: true }
    });
    const articlesByCategory = await prisma.category.findMany({
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });

    return {
      totalArticles,
      totalViews: totalViews._sum.viewCount || 0,
      byCategory: articlesByCategory.map(c => ({
        name: c.name,
        count: c._count.articles
      }))
    };
  }

  async incrementViewCount(articleId: string) {
    await prisma.article.update({
      where: { id: articleId },
      data: { viewCount: { increment: 1 } }
    });
  }
}
