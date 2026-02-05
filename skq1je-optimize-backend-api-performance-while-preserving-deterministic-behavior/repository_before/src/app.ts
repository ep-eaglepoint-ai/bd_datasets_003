import express from 'express';
import usersRouter from './routes/users';
import dashboardRouter from './routes/dashboard';
import reportsRouter from './routes/reports';

const app = express();
app.use(express.json());

app.use(usersRouter);
app.use(dashboardRouter);
app.use(reportsRouter);

export default app;
