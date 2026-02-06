import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';
import { 
  calculateTimeRemaining,
  generateSlug 
} from '../lib/utils';
import { authMiddleware, AuthContext, optionalAuthMiddleware } from '../middleware/auth';
import { createCountdownSchema, CreateCountdownInput } from '../schemas/countdown';
import { z } from 'zod';

const updateCountdownSchema = createCountdownSchema.partial();

const app = new Hono<{ Variables: { user?: any } }>();

app.get('/user/mine', authMiddleware, async (c: AuthContext) => {
  const user = c.user!;

  const all = await prisma.countdown.findMany({
    where: {
      userId: user.id,
      isArchived: false,
    },
  });

  const now = Date.now();
  const upcoming = all
    .filter(cd => cd.targetDate.getTime() >= now)
    .sort((a, b) => a.targetDate.getTime() - b.targetDate.getTime());
  const past = all
    .filter(cd => cd.targetDate.getTime() < now)
    .sort((a, b) => b.targetDate.getTime() - a.targetDate.getTime());

  const countdownsWithTime = [...upcoming, ...past].map(cd => ({
    ...cd,
    timeRemaining: calculateTimeRemaining(cd.targetDate),
  }));

  return c.json({
    success: true,
    data: countdownsWithTime,
  });
});

app.get('/public', async (c) => {
  const countdowns = await prisma.countdown.findMany({
    where: {
      isPublic: true,
      isArchived: false,
    },
    orderBy: { targetDate: 'asc' },
    take: 50,
  });

  return c.json({
    success: true,
    data: countdowns.map(cd => ({
      ...cd,
      timeRemaining: calculateTimeRemaining(cd.targetDate),
    })),
  });
});

app.post('/', optionalAuthMiddleware, zValidator('json', createCountdownSchema as any), async (c) => {
  try {
    console.log('Creating countdown...');

    const data = c.req.valid('json') as CreateCountdownInput;
    console.log('Data:', data);
    
    const user = (c as any).user ?? c.get('user');
    console.log('User:', user ? `ID: ${user.id}` : 'No user (public)');
    
    const slug = generateSlug();
    console.log('Generated slug:', slug);
    
    console.log('Attempting database create...');
    const countdown = await prisma.countdown.create({
      data: {
        ...data,
        slug,
        userId: user?.id,
        targetDate: new Date(data.targetDate),
      },
    });
    console.log('Created countdown ID:', countdown.id);
    
    return c.json({
      success: true,
      data: {
        ...countdown,
        shareUrl: `http://localhost:3000/countdown/${countdown.slug}`,
      },
    }, 201);
    
  } catch (error) {
    console.error('❌ ERROR creating countdown:', error);

    const errorObj = error as Error;
    console.error('Error name:', errorObj.name);
    console.error('Error message:', errorObj.message);
    console.error('Error stack:', errorObj.stack);

    const errorResponse: any = {
      success: false,
      error: 'Failed to create countdown',
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = errorObj.message;
      errorResponse.stack = errorObj.stack;
    }
    
    return c.json(errorResponse, 500);
  }
});

app.get('/:slug', optionalAuthMiddleware, async (c: AuthContext) => {
  const slug = c.req.param('slug');

  const countdown = await prisma.countdown.findUnique({
    where: { slug },
  });

  if (!countdown || countdown.isArchived) {
    return c.json({ error: 'Countdown not found' }, 404);
  }

  if (!countdown.isPublic) {
    const user = c.user;
    if (!user || countdown.userId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  const timeRemaining = calculateTimeRemaining(countdown.targetDate);

  return c.json({
    success: true,
    data: {
      ...countdown,
      timeRemaining,
    },
  });
});

const validateSchema = (schema: z.ZodSchema) => {
  return async (c: any, next: any) => {
    try {
      const body = await c.req.json();
      const result = schema.safeParse(body);
      
      if (!result.success) {
        return c.json({ 
          success: false,
          error: 'Validation failed',
          details: result.error.errors 
        }, 400);
      }

      c.req.validatedData = result.data;
      await next();
    } catch (error) {
      return c.json({ 
        success: false,
        error: 'Invalid JSON' 
      }, 400);
    }
  };
};

app.patch('/:id', authMiddleware, validateSchema(updateCountdownSchema), async (c: AuthContext) => {
  const id = c.req.param('id');
  const data = (c.req as any).validatedData; 
  const user = c.user!;
  
  const countdown = await prisma.countdown.findFirst({
    where: { id, userId: user.id },
  });
  
  if (!countdown) {
    return c.json({ error: 'Countdown not found or unauthorized' }, 404);
  }
  
  const updated = await prisma.countdown.update({
    where: { id },
    data: {
      ...data,
      ...(data.targetDate ? { targetDate: new Date(data.targetDate) } : {}),
    },
  });
  
  return c.json({
    success: true,
    data: updated,
  });
});

app.delete('/:id', authMiddleware, async (c: AuthContext) => {
  const id = c.req.param('id');
  const user = c.user!;
  
  const countdown = await prisma.countdown.findFirst({
    where: { id, userId: user.id },
  });
  
  if (!countdown) {
    return c.json({ error: 'Countdown not found or unauthorized' }, 404);
  }
  
  await prisma.countdown.delete({
    where: { id },
  });
  
  return c.json({
    success: true,
    message: 'Countdown deleted',
  });
});

export default app;