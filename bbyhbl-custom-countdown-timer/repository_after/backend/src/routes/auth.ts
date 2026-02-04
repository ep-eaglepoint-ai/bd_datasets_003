import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { hash, compare } from 'bcryptjs';
import { prisma } from '../lib/db';
import { generateToken } from '../middleware/auth';
import { z } from 'zod';

const app = new Hono();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

app.post('/register', zValidator('json', registerSchema as any), async (c) => {
  const { email, username, password } = c.req.valid('json');

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });
  
  if (existingUser) {
    return c.json({ error: 'User already exists' }, 400);
  }
  
  const hashedPassword = await hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      password: hashedPassword,
    },
  });

  const token = generateToken(user.id, user.email, user.username);
  
  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      token,
    },
  }, 201);
});

app.post('/login', zValidator('json', loginSchema as any), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await prisma.user.findUnique({
    where: { email },
  });
  
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const isValidPassword = await compare(password, user.password);
  
  if (!isValidPassword) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  const token = generateToken(user.id, user.email, user.username);
  
  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      token,
    },
  });
});

app.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ error: 'No token provided' }, 401);
  }
 
  return c.json({ 
    message: 'User endpoint - token verification would happen here' 
  });
});

export default app;