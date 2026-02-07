import { Router, Request, Response } from 'express';
import { moveCard } from '../boardStore';
import { MoveRequest } from '../../shared/types';

const router = Router();

router.post('/', (req: Request<{}, {}, MoveRequest>, res: Response) => {
    const { cardId, sourceColumnId, targetColumnId, targetIndex } = req.body;

    if (!cardId || !sourceColumnId || !targetColumnId || targetIndex === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const updatedBoard = moveCard(cardId, sourceColumnId, targetColumnId, targetIndex);
        return res.status(200).json({ success: true, board: updatedBoard });
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Error moving card' });
    }
});

export default router;
