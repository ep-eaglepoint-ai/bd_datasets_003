import express from 'express';
import { articleRoutes } from './routes/articles';
import { categoryRoutes } from './routes/categories';
import { userRoutes } from './routes/users';

const app = express();

app.use(express.json());
app.use('/api/articles', articleRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
