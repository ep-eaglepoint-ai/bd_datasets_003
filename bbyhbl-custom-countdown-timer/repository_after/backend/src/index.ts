import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { config } from './config';
import countdownRoutes from './routes/countdowns';
import authRoutes from './routes/auth';

const app = new Hono();

app.use('*', cors({
  origin: ['http://localhost:3000'],
  credentials: true,
}));

app.get('/', (c) => {
  return c.json({ 
    message: 'Countdown Timer API',
    version: '1.0.0',
    status: 'healthy'
  });
});

app.route('/api/countdowns', countdownRoutes);
app.route('/api/auth', authRoutes);
const port = parseInt(config.PORT);
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});