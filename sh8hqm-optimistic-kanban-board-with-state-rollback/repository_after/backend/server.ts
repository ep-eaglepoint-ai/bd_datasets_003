import express from 'express';
import cors from 'cors';
import moveRouter from './routes/move';
import { getBoard } from './boardStore';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/board', (req, res) => {
    res.json(getBoard());
});

app.use('/api/move', moveRouter);

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export default app;
