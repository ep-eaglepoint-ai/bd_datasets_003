import { Router } from 'express';
import { prisma } from '../db/prisma';

const router = Router();

router.get('/', async (req, res) => {
  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: { articles: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  res.json(categories);
});

router.get('/:id', async (req, res) => {
  const category = await prisma.category.findUnique({
    where: { id: req.params.id },
    include: {
      articles: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { author: true }
      },
      _count: {
        select: { articles: true }
      }
    }
  });

  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }

  res.json(category);
});

router.post('/', async (req, res) => {
  const category = await prisma.category.create({
    data: req.body
  });

  res.status(201).json(category);
});

router.put('/:id', async (req, res) => {
  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: req.body
  });

  res.json(category);
});

router.delete('/:id', async (req, res) => {
  await prisma.category.delete({
    where: { id: req.params.id }
  });

  res.status(204).send();
});

export { router as categoryRoutes };
