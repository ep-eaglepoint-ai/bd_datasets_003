import express from 'express';
import paymentsRouter from './routes/payments';

const app = express();
app.use(express.json());
app.use(paymentsRouter);

export default app;
