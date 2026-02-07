import { Router } from 'express';
import { prisma } from '../db/prisma';

const router = Router();

router.get('/me', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      articles: {
        take: 5,
        orderBy: { createdAt: 'desc' }
      },
      _count: {
        select: { articles: true, comments: true }
      }
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(user);
});

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      articles: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { category: true }
      },
      _count: {
        select: { articles: true, comments: true }
      }
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(user);
});

router.put('/me', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: req.body
  });

  res.json(user);
});

export { router as userRoutes };
