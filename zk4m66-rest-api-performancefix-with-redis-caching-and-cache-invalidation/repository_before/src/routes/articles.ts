import { Router } from 'express';
import { prisma } from '../db/prisma';

const router = Router();

router.get('/', async (req, res) => {
  const { page = 1, limit = 20, category, search } = req.query;
  
  const articles = await prisma.article.findMany({
    where: {
      ...(category && { categoryId: category as string }),
      ...(search && { 
        OR: [
          { title: { contains: search as string } },
          { content: { contains: search as string } }
        ]
      })
    },
    include: {
      author: true,
      category: true,
      tags: true
    },
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    orderBy: { createdAt: 'desc' }
  });

  const total = await prisma.article.count({
    where: {
      ...(category && { categoryId: category as string }),
      ...(search && { 
        OR: [
          { title: { contains: search as string } },
          { content: { contains: search as string } }
        ]
      })
    }
  });

  res.json({ articles, total, page: Number(page), limit: Number(limit) });
});

router.get('/:id', async (req, res) => {
  const article = await prisma.article.findUnique({
    where: { id: req.params.id },
    include: {
      author: true,
      category: true,
      tags: true,
      comments: {
        include: { author: true },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!article) {
    return res.status(404).json({ error: 'Article not found' });
  }

  res.json(article);
});

router.post('/', async (req, res) => {
  const article = await prisma.article.create({
    data: req.body,
    include: {
      author: true,
      category: true
    }
  });

  res.status(201).json(article);
});

router.put('/:id', async (req, res) => {
  const article = await prisma.article.update({
    where: { id: req.params.id },
    data: req.body,
    include: {
      author: true,
      category: true
    }
  });

  res.json(article);
});

router.delete('/:id', async (req, res) => {
  await prisma.article.delete({
    where: { id: req.params.id }
  });

  res.status(204).send();
});

export { router as articleRoutes };
