import express from 'express';
import ordersRouter from './routes/orders';

const app = express();
app.use(express.json());
app.use(ordersRouter);

export default app;
