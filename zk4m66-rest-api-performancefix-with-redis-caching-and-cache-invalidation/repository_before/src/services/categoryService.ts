import { prisma } from '../db/prisma';

export class CategoryService {
  async getCategoryTree() {
    const categories = await prisma.category.findMany({
      include: {
        children: {
          include: {
            _count: {
              select: { articles: true }
            }
          }
        },
        _count: {
          select: { articles: true }
        }
      },
      where: {
        parentId: null
      }
    });

    return categories;
  }

  async getCategoryWithArticles(categoryId: string, page: number = 1, limit: number = 20) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        articles: {
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            author: true,
            _count: {
              select: { comments: true }
            }
          }
        },
        _count: {
          select: { articles: true }
        }
      }
    });

    return category;
  }
}
